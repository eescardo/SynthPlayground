export interface DspWasmExports {
  softclip_sample?: (x: number, drive: number) => number;
  one_pole_step?: (current: number, target: number, alpha: number) => number;
}

let cachedWasm: DspWasmExports | null = null;

export const loadDspWasm = async (): Promise<DspWasmExports | null> => {
  if (cachedWasm) {
    return cachedWasm;
  }

  try {
    const response = await fetch("/wasm/pkg/dsp_core_bg.wasm");
    if (!response.ok) {
      return null;
    }
    const bytes = await response.arrayBuffer();
    const wasmModule = await WebAssembly.instantiate(bytes, {});
    cachedWasm = wasmModule.instance.exports as unknown as DspWasmExports;
    return cachedWasm;
  } catch {
    return null;
  }
};
