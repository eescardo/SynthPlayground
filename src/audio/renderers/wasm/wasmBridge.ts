export interface DspWasmExports {
  softclip_sample?: (x: number, drive: number) => number;
  one_pole_step?: (current: number, target: number, alpha: number) => number;
}

interface DspWasmBindgenModule extends DspWasmExports {
  default: (options?: {
    module_or_path?: string | URL | Request | Response | BufferSource | WebAssembly.Module;
  }) => Promise<unknown>;
}

let cachedWasm: DspWasmExports | null = null;

export const loadDspWasm = async (): Promise<DspWasmExports> => {
  if (cachedWasm) {
    return cachedWasm;
  }

  try {
    const bindgenModuleUrl = "/wasm/pkg/dsp_core.js";
    const bindgenModule = (await import(/* webpackIgnore: true */ bindgenModuleUrl)) as DspWasmBindgenModule;
    await bindgenModule.default({ module_or_path: "/wasm/pkg/dsp_core_bg.wasm" });
    cachedWasm = {
      softclip_sample: bindgenModule.softclip_sample,
      one_pole_step: bindgenModule.one_pole_step
    };
    return cachedWasm;
  } catch (error) {
    throw error;
  }
};
