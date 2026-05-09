import { SproutChatMessage } from "@/lib/sproutChatPersistence";

export interface SproutChatRequest {
  messages: SproutChatMessage[];
}

export interface OpenAiResponsesPayload {
  model: string;
  input: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  instructions: string;
  store: boolean;
}

const MAX_CHAT_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4_000;

export const SPROUT_PLACEHOLDER_INSTRUCTIONS =
  "You are Sprout, a concise assistant for a browser-based patch synthesis workspace. " +
  "For now, answer only from the user's chat text and avoid claiming access to patch-editing tools.";

export const createOpenAiResponsesPayload = (messages: SproutChatMessage[], model: string): OpenAiResponsesPayload => ({
  model,
  input: messages.slice(-MAX_CHAT_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content.slice(0, MAX_MESSAGE_CHARS)
  })),
  instructions: SPROUT_PLACEHOLDER_INSTRUCTIONS,
  store: false
});

export const extractOpenAiResponseText = (response: unknown): string => {
  if (typeof response !== "object" || response === null) {
    return "";
  }

  const maybeOutputText = (response as { output_text?: unknown }).output_text;
  if (typeof maybeOutputText === "string" && maybeOutputText.trim().length > 0) {
    return maybeOutputText;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (typeof item !== "object" || item === null || !Array.isArray((item as { content?: unknown }).content)) {
        return [];
      }
      return (item as { content: unknown[] }).content.flatMap((contentItem) => {
        if (typeof contentItem !== "object" || contentItem === null) {
          return [];
        }
        const text = (contentItem as { text?: unknown }).text;
        return typeof text === "string" ? [text] : [];
      });
    })
    .join("\n")
    .trim();
};

export const isSproutChatRequest = (value: unknown): value is SproutChatRequest => {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { messages?: unknown }).messages)) {
    return false;
  }
  return (value as { messages: unknown[] }).messages.every((message) => {
    if (typeof message !== "object" || message === null) {
      return false;
    }
    const candidate = message as Partial<SproutChatMessage>;
    return (
      typeof candidate.id === "string" &&
      (candidate.role === "user" || candidate.role === "assistant") &&
      typeof candidate.content === "string" &&
      typeof candidate.createdAt === "string"
    );
  });
};
