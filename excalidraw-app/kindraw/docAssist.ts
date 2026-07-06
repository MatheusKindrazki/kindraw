// Client for the document writing-assistant endpoint (`/v1/ai/doc/assist`).
// Streams Server-Sent Events from the Kindraw worker (backed by GLM-4.7) and
// accumulates the resulting Markdown. Mirrors the base-url resolution used by
// the canvas AI wiring in `../components/AI.tsx`.

export type DocAssistAction =
  | "improve"
  | "expand"
  | "shorten"
  | "fix"
  | "tone"
  | "translate"
  | "continue"
  | "custom";

export type DocAssistPayload = {
  action: DocAssistAction;
  text?: string;
  context?: string;
  instruction?: string;
  title?: string;
};

const getAIBaseUrl = () => {
  const configuredKindrawApiBaseUrl =
    import.meta.env.VITE_APP_KINDRAW_API_BASE_URL?.trim();
  if (configuredKindrawApiBaseUrl) {
    return configuredKindrawApiBaseUrl.replace(/\/+$/, "");
  }

  const configuredAIBaseUrl = import.meta.env.VITE_APP_AI_BACKEND?.trim();
  if (configuredAIBaseUrl) {
    return configuredAIBaseUrl.replace(/\/+$/, "");
  }

  return window.location.origin;
};

const parseErrorText = (text: string): string | null => {
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || parsed?.message || null;
  } catch {
    return text || null;
  }
};

/**
 * Streams a writing-assistant response. Calls `onChunk` for each Markdown delta
 * and resolves with the full trimmed Markdown. Throws on HTTP or stream errors.
 */
export const streamDocAssist = async (
  payload: DocAssistPayload,
  opts: { onChunk?: (delta: string) => void; signal?: AbortSignal } = {},
): Promise<string> => {
  const response = await fetch(`${getAIBaseUrl()}/v1/ai/doc/assist`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      parseErrorText(text) || `AI request failed (${response.status}).`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") {
        continue;
      }
      let event: {
        type?: string;
        delta?: string;
        error?: { message?: string };
      };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === "content" && event.delta) {
        full += event.delta;
        opts.onChunk?.(event.delta);
      } else if (event.type === "error") {
        throw new Error(event.error?.message || "AI request failed.");
      }
    }
  }

  return full.trim();
};
