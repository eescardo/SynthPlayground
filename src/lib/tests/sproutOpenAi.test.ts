import { describe, expect, it } from "vitest";
import { createOpenAiResponsesPayload, extractOpenAiResponseText, isSproutChatRequest } from "@/lib/sproutOpenAi";
import { SproutChatMessage } from "@/lib/sproutChatPersistence";

const message = (role: SproutChatMessage["role"], content: string): SproutChatMessage => ({
  id: `${role}_${content}`,
  role,
  content,
  createdAt: "2026-05-09T00:00:00.000Z"
});

describe("sprout OpenAI helpers", () => {
  it("builds a Responses payload without storing server-side conversation state", () => {
    const payload = createOpenAiResponsesPayload([message("user", "hello")], "gpt-test");

    expect(payload).toMatchObject({
      model: "gpt-test",
      store: false,
      input: [{ role: "user", content: "hello" }]
    });
    expect(payload.instructions).toContain("Sprout");
  });

  it("extracts text from output_text or output message content", () => {
    expect(extractOpenAiResponseText({ output_text: "direct" })).toBe("direct");
    expect(
      extractOpenAiResponseText({
        output: [{ content: [{ text: "from" }, { text: "content" }] }]
      })
    ).toBe("from\ncontent");
  });

  it("validates chat requests before proxying them to OpenAI", () => {
    expect(isSproutChatRequest({ messages: [message("user", "hi")] })).toBe(true);
    expect(isSproutChatRequest({ messages: [{ role: "user", content: "missing fields" }] })).toBe(false);
  });
});
