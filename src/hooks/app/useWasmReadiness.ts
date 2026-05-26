"use client";

import { useEffect, useState } from "react";
import { loadDspWasm } from "@/audio/renderers/wasm/wasmBridge";
import { BrowserCompatibilityIssue, getBrowserCompatibilityIssue } from "@/lib/browserCompatibility";
import { createSproutError, SproutErrorSetter } from "@/lib/sproutErrors";
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
          severity: "error",
          message: "The default WASM renderer requires WebAssembly SIMD support in this browser.",
          error: "Missing WebAssembly SIMD support",
          phase: "browser_compatibility"
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
        setRuntimeError(
          createSproutError({
            source: "wasm_readiness",
            severity: "error",
            message: (error as Error).message,
            error: (error as Error).message,
            phase: "load_wasm"
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
