import { describe, expect, it } from "vitest";
import { createSproutChatStorageKey } from "@/lib/sproutChatPersistence";

describe("sprout chat persistence", () => {
  it("binds the current chat storage key to the project", () => {
    expect(createSproutChatStorageKey("project_alpha")).toBe("project:project_alpha:current");
  });
});
