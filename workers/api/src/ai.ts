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

const createOpenRouterClient = (env: Env) => {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(503, "OpenRouter is not configured.");
  }

  return new OpenAI({
    apiKey,
    baseURL: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
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
  const client = createOpenRouterClient(env);
  const stream = await client.chat.completions.create({
    model: env.OPENROUTER_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL,
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

export const handleDiagramToCodeGenerate = async (
  request: Request,
  env: Env,
  userId: string,
) => {
  const input = await readJson<DiagramToCodeInput>(request);
  const client = createOpenRouterClient(env);
  const completion = await client.chat.completions.create({
    model: env.OPENROUTER_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
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
