import { describe, expect, it, vi } from "vitest";
import { getBrowserCompatibilityIssue } from "@/lib/browserCompatibility";

describe("getBrowserCompatibilityIssue", () => {
  it("returns null when all required features are supported", () => {
    const originalValidate = WebAssembly.validate;
    const validate = vi.fn(() => true);
    Object.defineProperty(WebAssembly, "validate", {
      configurable: true,
      value: validate
    });

    const issue = getBrowserCompatibilityIssue(["wasm-simd"], {
      title: "Compatibility issue",
      summary: "Missing features"
    });

    expect(issue).toBeNull();

    Object.defineProperty(WebAssembly, "validate", {
      configurable: true,
      value: originalValidate
    });
  });

  it("returns a reusable issue description when a required feature is missing", () => {
    const originalValidate = WebAssembly.validate;
    const validate = vi.fn(() => false);
    Object.defineProperty(WebAssembly, "validate", {
      configurable: true,
      value: validate
    });

    const issue = getBrowserCompatibilityIssue(["wasm-simd"], {
      title: "Browser not compatible with the WASM renderer",
      summary: "This build uses the WASM audio renderer by default and requires browser features that are not available in your current browser."
    });

    expect(issue).toEqual({
      title: "Browser not compatible with the WASM renderer",
      summary: "This build uses the WASM audio renderer by default and requires browser features that are not available in your current browser.",
      requirements: [
        {
          id: "wasm-simd",
          label: "WebAssembly SIMD",
          description: "Required for the default WASM audio renderer used by this build.",
          supportedBrowsers: "Chrome/Edge 91+, Firefox 89+, Safari 16.4+"
        }
      ]
    });

    Object.defineProperty(WebAssembly, "validate", {
      configurable: true,
      value: originalValidate
    });
  });
});
