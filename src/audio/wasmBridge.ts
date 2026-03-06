export interface DspWasmExports {
  softclip_sample?: (x: number, drive: number) => number;
  one_pole_step?: (current: number, target: number, alpha: number) => number;
}

interface DspWasmBindgenModule extends DspWasmExports {
  default: (moduleOrPath?: string | URL | Request | Response | BufferSource | WebAssembly.Module) => Promise<unknown>;
}

let cachedWasm: DspWasmExports | null = null;

export const loadDspWasm = async (): Promise<DspWasmExports | null> => {
  if (cachedWasm) {
    return cachedWasm;
  }

  const strict = process.env.NEXT_PUBLIC_STRICT_WASM === "1";

  try {
    const bindgenModuleUrl = "/wasm/pkg/dsp_core.js";
    const bindgenModule = (await import(/* webpackIgnore: true */ bindgenModuleUrl)) as DspWasmBindgenModule;
    await bindgenModule.default("/wasm/pkg/dsp_core_bg.wasm");
    cachedWasm = {
      softclip_sample: bindgenModule.softclip_sample,
      one_pole_step: bindgenModule.one_pole_step
    };
    return cachedWasm;
  } catch (error) {
    if (strict) {
      throw error;
    }
    return null;
  }
};
