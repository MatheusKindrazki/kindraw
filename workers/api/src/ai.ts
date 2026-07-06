import OpenAI from "openai";

import { HttpError } from "./store";

import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import type { Env } from "./types";

type TextToDiagramInput = {
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
  }>;
};

type DiagramToCodeInput = {
  texts?: string;
  image?: string;
  theme?: "light" | "dark";
};

type TextToDiagramMessage = {
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TEXT_MODEL = "minimax/minimax-m2.5";
const DEFAULT_VISION_MODEL = "minimax/minimax-01";

const TEXT_TO_DIAGRAM_SYSTEM_PROMPT = `You generate Mermaid diagrams for Kindraw.

Return only Mermaid code.
Never wrap the output in markdown fences.
Never add prose, explanations, notes, or bullet points.
Default to flowchart LR unless the user clearly asks for another Mermaid diagram type.
Use short, safe node identifiers.
Quote labels when they contain spaces or punctuation.
Prefer syntax that is broadly compatible with Mermaid renderers used in editors.
If the request is ambiguous, make the most reasonable diagram instead of asking follow-up questions.`;

const DIAGRAM_TO_CODE_SYSTEM_PROMPT = `You convert low-fidelity wireframes into production-style HTML prototypes.

Return exactly one complete HTML document.
Never wrap the output in markdown fences.
Do not include explanations before or after the HTML.
Use semantic HTML and inline CSS inside a <style> tag.
Do not rely on external scripts, CSS frameworks, or remote assets.
Preserve the visible structure, labels, hierarchy, and intent from the wireframe.
Use the provided text hints when they help clarify unreadable labels.
Produce polished but pragmatic UI code that matches the wireframe intent.`;

const textEncoder = new TextEncoder();

const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
};

const getOpenRouterHeaders = (env: Env) => {
  const headers: Record<string, string> = {};
  const referer = env.OPENROUTER_HTTP_REFERER?.trim() || env.KINDRAW_APP_ORIGIN;
  const title = env.OPENROUTER_APP_TITLE?.trim() || "Kindraw AI";

  if (referer) {
    headers["HTTP-Referer"] = referer;
  }

  if (title) {
    headers["X-Title"] = title;
  }

  return headers;
};

// Text and vision can point at independent OpenAI-compatible providers. Each
// role resolves its own base URL / key / model, falling back to the shared
// OPENROUTER_* config so existing single-provider deployments keep working.
type AiProviderConfig = {
  apiKey: string | undefined;
  baseURL: string;
  model: string;
};

const resolveTextProvider = (env: Env): AiProviderConfig => ({
  apiKey: env.AI_TEXT_API_KEY?.trim() || env.OPENROUTER_API_KEY?.trim(),
  baseURL:
    env.AI_TEXT_BASE_URL?.trim() ||
    env.OPENROUTER_BASE_URL?.trim() ||
    DEFAULT_OPENROUTER_BASE_URL,
  model:
    env.AI_TEXT_MODEL?.trim() ||
    env.OPENROUTER_TEXT_MODEL?.trim() ||
    DEFAULT_TEXT_MODEL,
});

const resolveVisionProvider = (env: Env): AiProviderConfig => ({
  apiKey: env.AI_VISION_API_KEY?.trim() || env.OPENROUTER_API_KEY?.trim(),
  baseURL:
    env.AI_VISION_BASE_URL?.trim() ||
    env.OPENROUTER_BASE_URL?.trim() ||
    DEFAULT_OPENROUTER_BASE_URL,
  model:
    env.AI_VISION_MODEL?.trim() ||
    env.OPENROUTER_VISION_MODEL?.trim() ||
    DEFAULT_VISION_MODEL,
});

const createProviderClient = (env: Env, provider: AiProviderConfig) => {
  if (!provider.apiKey) {
    throw new HttpError(503, "AI provider is not configured.");
  }

  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    defaultHeaders: getOpenRouterHeaders(env),
  });
};

const normalizeMessageContent = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("");
};

const stripCodeFences = (value: string) =>
  value
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();

const getErrorStatus = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return undefined;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "AI request failed.";
};

const toSSEChunk = (payload: unknown) =>
  textEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

const toDoneChunk = (finishReason: string | null) =>
  toSSEChunk({
    type: "done",
    finishReason,
  });

const doneMarkerChunk = () => textEncoder.encode("data: [DONE]\n\n");

const createSSEStream = (stream: AsyncIterable<ChatCompletionChunk>) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = async () => {
        let finishReason: string | null = null;

        try {
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) {
              continue;
            }

            const delta = normalizeMessageContent(choice.delta?.content);
            if (delta) {
              controller.enqueue(
                toSSEChunk({
                  type: "content",
                  delta,
                }),
              );
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          }

          controller.enqueue(toDoneChunk(finishReason));
          controller.enqueue(doneMarkerChunk());
        } catch (error) {
          controller.enqueue(
            toSSEChunk({
              type: "error",
              error: {
                message: getErrorMessage(error),
                status: getErrorStatus(error),
              },
            }),
          );
          controller.enqueue(toDoneChunk(finishReason));
          controller.enqueue(doneMarkerChunk());
        } finally {
          controller.close();
        }
      };

      void pump();
    },
  });

const buildTextToDiagramMessages = (
  input: TextToDiagramInput,
): ChatCompletionMessageParam[] => {
  const messages = input.messages?.filter(
    (message): message is TextToDiagramMessage =>
      Boolean(
        message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim(),
      ),
  );

  if (!messages?.length) {
    throw new HttpError(400, "At least one chat message is required.");
  }

  return [
    {
      role: "system",
      content: TEXT_TO_DIAGRAM_SYSTEM_PROMPT,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    })),
  ];
};

export const handleTextToDiagramChatStreaming = async (
  request: Request,
  env: Env,
  userId: string,
) => {
  const input = await readJson<TextToDiagramInput>(request);
  const provider = resolveTextProvider(env);
  const client = createProviderClient(env, provider);
  const stream = await client.chat.completions.create({
    model: provider.model,
    stream: true,
    temperature: 0.2,
    messages: buildTextToDiagramMessages(input),
    user: userId,
  });
  const body = createSSEStream(stream);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};

const buildDiagramToCodeMessages = (
  input: DiagramToCodeInput,
): ChatCompletionMessageParam[] => {
  const image = input.image?.trim();
  if (!image) {
    throw new HttpError(400, "Wireframe image is required.");
  }

  const texts = input.texts?.trim();
  const theme = input.theme === "dark" ? "dark" : "light";

  return [
    {
      role: "system",
      content: DIAGRAM_TO_CODE_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Theme hint: ${theme}.`,
        },
        {
          type: "text",
          text: texts
            ? `Visible text extracted from the wireframe:\n${texts}`
            : "No OCR text hints were extracted from the wireframe.",
        },
        {
          type: "image_url",
          image_url: {
            url: image,
            detail: "low",
          },
        },
      ],
    },
  ];
};

type DocAssistAction =
  | "improve"
  | "expand"
  | "shorten"
  | "fix"
  | "tone"
  | "translate"
  | "continue"
  | "custom";

type DocAssistInput = {
  action?: DocAssistAction;
  // Selected text for rewrite actions (improve/expand/shorten/fix/tone/translate).
  text?: string;
  // Surrounding document text, used as context for continue/custom generation.
  context?: string;
  // Free-form parameter: tone name, target language, or a custom instruction.
  instruction?: string;
  title?: string;
};

const DOC_ASSIST_SYSTEM_PROMPT = `You are a writing assistant embedded in a Kindraw document editor.

Return ONLY the resulting Markdown text — no code fences, no preamble, no explanations, and no surrounding quotes.
Preserve the author's voice, meaning, and Markdown formatting conventions.
Unless the task is explicitly a translation, always respond in the SAME language as the input text.
Keep formatting clean and minimal; do not invent headings, lists, or sections that were not present or requested.
When rewriting a passage, return a drop-in replacement for it — nothing more.`;

const DOC_ASSIST_ACTIONS = new Set<DocAssistAction>([
  "improve",
  "expand",
  "shorten",
  "fix",
  "tone",
  "translate",
  "continue",
  "custom",
]);

const buildDocAssistMessages = (
  input: DocAssistInput,
): ChatCompletionMessageParam[] => {
  const action = input.action;
  if (!action || !DOC_ASSIST_ACTIONS.has(action)) {
    throw new HttpError(400, "A valid writing action is required.");
  }

  const text = input.text?.trim() ?? "";
  const context = input.context?.trim() ?? "";
  const instruction = input.instruction?.trim() ?? "";
  const title = input.title?.trim();

  const rewriteActions: DocAssistAction[] = [
    "improve",
    "expand",
    "shorten",
    "fix",
    "tone",
    "translate",
  ];
  if (rewriteActions.includes(action) && !text) {
    throw new HttpError(400, "Selected text is required for this action.");
  }
  if (action === "custom" && !instruction) {
    throw new HttpError(400, "An instruction is required.");
  }
  if ((action === "tone" || action === "translate") && !instruction) {
    throw new HttpError(
      400,
      action === "tone"
        ? "A target tone is required."
        : "A target language is required.",
    );
  }

  const taskByAction: Record<DocAssistAction, string> = {
    improve:
      "Improve the writing of the passage below — clarity, flow, and word choice — without changing its meaning or language.",
    expand:
      "Expand the passage below with more detail and depth, keeping the same intent, tone, and language.",
    shorten:
      "Make the passage below more concise while preserving its key information, tone, and language.",
    fix: "Fix spelling, grammar, and punctuation in the passage below. Change nothing else.",
    tone: `Rewrite the passage below in a ${instruction} tone, keeping its meaning and language.`,
    translate: `Translate the passage below into ${instruction}. Return only the translation.`,
    continue:
      "Continue writing naturally from where the document leaves off. Match the existing voice, tone, and language. Return only the new continuation text.",
    custom: instruction,
  };

  const parts: string[] = [];
  if (title) {
    parts.push(`Document title: ${title}`);
  }
  parts.push(taskByAction[action]);

  if (action === "continue") {
    parts.push(
      `Document so far:\n"""\n${context || text}\n"""`,
    );
  } else if (action === "custom") {
    if (text) {
      parts.push(`Selected passage:\n"""\n${text}\n"""`);
    } else if (context) {
      parts.push(`Document context:\n"""\n${context}\n"""`);
    }
  } else {
    parts.push(`Passage:\n"""\n${text}\n"""`);
  }

  return [
    {
      role: "system",
      content: DOC_ASSIST_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: parts.join("\n\n"),
    },
  ];
};

export const handleDocAssistStreaming = async (
  request: Request,
  env: Env,
  userId: string,
) => {
  const input = await readJson<DocAssistInput>(request);
  const messages = buildDocAssistMessages(input);
  const provider = resolveTextProvider(env);
  const client = createProviderClient(env, provider);
  const stream = await client.chat.completions.create({
    model: provider.model,
    stream: true,
    temperature: 0.4,
    messages,
    user: userId,
    // GLM reasons by default (~40s latency); disable it for snappy inline
    // edits. Non-standard field, cast to `{}` so it passes through at runtime
    // while staying invisible to the SDK types; OpenAI-compatible providers
    // that don't support it simply ignore it.
    ...({ thinking: { type: "disabled" } } as {}),
  });
  const body = createSSEStream(stream);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};

export const handleDiagramToCodeGenerate = async (
  request: Request,
  env: Env,
  userId: string,
) => {
  const input = await readJson<DiagramToCodeInput>(request);
  const provider = resolveVisionProvider(env);
  const client = createProviderClient(env, provider);
  const completion = await client.chat.completions.create({
    model: provider.model,
    temperature: 0.2,
    messages: buildDiagramToCodeMessages(input),
    user: userId,
  });

  const html = stripCodeFences(
    normalizeMessageContent(completion.choices[0]?.message?.content),
  );

  if (!html) {
    throw new HttpError(502, "AI provider returned an empty HTML response.");
  }

  return new Response(
    JSON.stringify({
      html,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};
