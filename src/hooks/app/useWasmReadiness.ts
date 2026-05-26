"use client";

import { useEffect, useState } from "react";
import { loadDspWasm } from "@/audio/renderers/wasm/wasmBridge";
import { BrowserCompatibilityIssue, getBrowserCompatibilityIssue } from "@/lib/browserCompatibility";
import { createSproutError, SproutErrorSetter, toError } from "@/lib/sproutErrors";
import { isUiCaptureFakeAudioEnabled } from "@/lib/uiCaptureMode";

export function useWasmReadiness({ ready, setRuntimeError }: { ready: boolean; setRuntimeError: SproutErrorSetter }) {
  const [wasmReady, setWasmReady] = useState(false);
  const [browserCompatibilityIssue, setBrowserCompatibilityIssue] = useState<BrowserCompatibilityIssue | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (isUiCaptureFakeAudioEnabled()) {
      setBrowserCompatibilityIssue(null);
      setRuntimeError(null);
      setWasmReady(true);
      return;
    }
    const compatibilityIssue = getBrowserCompatibilityIssue(["wasm-simd"], {
      title: "Browser not compatible with the WASM renderer",
      summary:
        "This build uses the WASM audio renderer by default and requires browser features that are not available in your current browser."
    });
    if (compatibilityIssue) {
      setBrowserCompatibilityIssue(compatibilityIssue);
      setRuntimeError(
        createSproutError({
          source: "wasm_readiness",
          code: "browser_unsupported",
          severity: "error",
          message: "The default WASM renderer requires WebAssembly SIMD support in this browser.",
          error: new Error("Missing WebAssembly SIMD support"),
          details: { phase: "browser_compatibility" }
        })
      );
      setWasmReady(false);
      return;
    }

    loadDspWasm()
      .then(() => {
        setBrowserCompatibilityIssue(null);
        setRuntimeError(null);
        setWasmReady(true);
      })
      .catch((error) => {
        const cause = toError(error);
        setRuntimeError(
          createSproutError({
            source: "wasm_readiness",
            code: "load_failed",
            severity: "error",
            message: cause.message,
            error: cause,
            details: { phase: "load_wasm" }
          })
        );
        setWasmReady(false);
      });
  }, [ready, setRuntimeError]);

  return {
    browserCompatibilityIssue,
    setBrowserCompatibilityIssue,
    wasmReady
  };
}
