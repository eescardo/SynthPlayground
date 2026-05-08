export type BrowserCompatibilityFeatureId = "wasm-simd";

export interface BrowserCompatibilityRequirement {
  id: BrowserCompatibilityFeatureId;
  label: string;
  description: string;
  supportedBrowsers: string;
}

export interface BrowserCompatibilityIssue {
  title: string;
  summary: string;
  requirements: BrowserCompatibilityRequirement[];
}

const WASM_SIMD_PROBE_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x0a,
  0x17, 0x01, 0x15, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x1a, 0x0b
]);

const detectWasmSimdSupport = (): boolean => {
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
    return false;
  }

  try {
    return WebAssembly.validate(WASM_SIMD_PROBE_MODULE);
  } catch {
    return false;
  }
};

const FEATURE_REQUIREMENTS: Record<
  BrowserCompatibilityFeatureId,
  BrowserCompatibilityRequirement & { detect: () => boolean }
> = {
  "wasm-simd": {
    id: "wasm-simd",
    label: "WebAssembly SIMD",
    description: "Required for the default WASM audio renderer used by this build.",
    supportedBrowsers: "Chrome/Edge 91+, Firefox 89+, Safari 16.4+",
    detect: detectWasmSimdSupport
  }
};

const toRequirement = (
  requirement: BrowserCompatibilityRequirement & { detect: () => boolean }
): BrowserCompatibilityRequirement => ({
  id: requirement.id,
  label: requirement.label,
  description: requirement.description,
  supportedBrowsers: requirement.supportedBrowsers
});

interface BrowserCompatibilityOptions {
  title: string;
  summary: string;
}

export const getBrowserCompatibilityIssue = (
  requiredFeatures: BrowserCompatibilityFeatureId[],
  options: BrowserCompatibilityOptions
): BrowserCompatibilityIssue | null => {
  const missingRequirements = requiredFeatures
    .map((featureId) => FEATURE_REQUIREMENTS[featureId])
    .filter((requirement) => !requirement.detect())
    .map(toRequirement);

  if (missingRequirements.length === 0) {
    return null;
  }

  return {
    title: options.title,
    summary: options.summary,
    requirements: missingRequirements
  };
};
