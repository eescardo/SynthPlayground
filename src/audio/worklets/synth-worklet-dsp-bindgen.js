let wasm;
let cachedUint8ArrayMemory0 = null;
let WASM_VECTOR_LEN = 0;

const cachedTextDecoder =
  typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : null;
const cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

const decodeUtf8Fallback = (bytes) => {
  let encoded = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    let chunkString = "";
    for (let byteIndex = 0; byteIndex < chunk.length; byteIndex += 1) {
      chunkString += String.fromCharCode(chunk[byteIndex]);
    }
    encoded += chunkString;
  }
  return decodeURIComponent(escape(encoded));
};

const encodeUtf8Fallback = (value) => {
  const encoded = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    bytes[index] = encoded.charCodeAt(index);
  }
  return bytes;
};

const getUint8ArrayMemory0 = () => {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
};

const getStringFromWasm0 = (ptr, len) => {
  const bytes = getUint8ArrayMemory0().subarray(ptr, ptr + len);
  return cachedTextDecoder ? cachedTextDecoder.decode(bytes) : decodeUtf8Fallback(bytes);
};

const passStringToWasm0 = (arg, malloc, realloc) => {
  if (realloc === undefined) {
    const buf = cachedTextEncoder ? cachedTextEncoder.encode(arg) : encodeUtf8Fallback(arg);
    const ptr = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;

  for (; offset < len; offset += 1) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) {
      break;
    }
    mem[ptr + offset] = code;
  }

  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    if (cachedTextEncoder && typeof cachedTextEncoder.encodeInto === "function") {
      const ret = cachedTextEncoder.encodeInto(arg, view);
      offset += ret.written;
    } else {
      const buf = encodeUtf8Fallback(arg);
      view.set(buf);
      offset += buf.length;
    }
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
};

const takeFromExternrefTable0 = (idx) => {
  const value = wasm.__wbindgen_externrefs.get(idx);
  wasm.__externref_table_dealloc(idx);
  return value;
};

const getImports = () => ({
  __proto__: null,
  "./dsp_core_bg.js": {
    __proto__: null,
    __wbg___wbindgen_throw_6b64449b9b9ed33c(arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    },
    __wbg_now_a9b7df1cbee90986() {
      return Date.now();
    },
    __wbindgen_cast_0000000000000001(arg0, arg1) {
      return getStringFromWasm0(arg0, arg1);
    },
    __wbindgen_init_externref_table() {
      const table = wasm.__wbindgen_externrefs;
      const offset = table.grow(4);
      table.set(0, undefined);
      table.set(offset + 0, undefined);
      table.set(offset + 1, null);
      table.set(offset + 2, true);
      table.set(offset + 3, false);
    }
  }
});

export class WasmSubsetEngine {
  constructor(sampleRate, blockSize) {
    const ret = wasm.wasmsubsetengine_new(sampleRate, blockSize);
    this.__wbg_ptr = ret >>> 0;
  }

  block_size() {
    return wasm.wasmsubsetengine_block_size(this.__wbg_ptr) >>> 0;
  }

  enqueue_events(eventsJson) {
    const ptr0 = passStringToWasm0(eventsJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wasmsubsetengine_enqueue_events(this.__wbg_ptr, ptr0, len0);
    if (ret[1]) {
      throw takeFromExternrefTable0(ret[0]);
    }
  }

  configure_preview_probe_capture(captureJson) {
    const ptr0 = passStringToWasm0(captureJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wasmsubsetengine_configure_preview_probe_capture(this.__wbg_ptr, ptr0, len0);
    if (ret[1]) {
      throw takeFromExternrefTable0(ret[0]);
    }
  }

  left_ptr() {
    return wasm.wasmsubsetengine_left_ptr(this.__wbg_ptr) >>> 0;
  }

  process_block() {
    return wasm.wasmsubsetengine_process_block(this.__wbg_ptr) !== 0;
  }

  preview_capture_state_json() {
    let ptr1 = 0;
    let len1 = 0;
    try {
      const ret = wasm.wasmsubsetengine_preview_capture_state_json(this.__wbg_ptr);
      ptr1 = ret[0];
      len1 = ret[1];
      if (ret[3]) {
        ptr1 = 0;
        len1 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      return getStringFromWasm0(ptr1, len1);
    } finally {
      if (ptr1 || len1) {
        wasm.__wbindgen_free(ptr1, len1, 1);
      }
    }
  }

  profile_stats_json() {
    let ptr1 = 0;
    let len1 = 0;
    try {
      const ret = wasm.wasmsubsetengine_profile_stats_json(this.__wbg_ptr);
      ptr1 = ret[0];
      len1 = ret[1];
      if (ret[3]) {
        ptr1 = 0;
        len1 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      return getStringFromWasm0(ptr1, len1);
    } finally {
      if (ptr1 || len1) {
        wasm.__wbindgen_free(ptr1, len1, 1);
      }
    }
  }

  reset_profile_stats() {
    wasm.wasmsubsetengine_reset_profile_stats(this.__wbg_ptr);
  }

  right_ptr() {
    return wasm.wasmsubsetengine_right_ptr(this.__wbg_ptr) >>> 0;
  }

  set_profiling_enabled(enabled) {
    wasm.wasmsubsetengine_set_profiling_enabled(this.__wbg_ptr, enabled);
  }

  start_stream(projectJson, songStartSample, eventsJson, sessionId, randomSeed) {
    const ptr0 = passStringToWasm0(projectJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(eventsJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.wasmsubsetengine_start_stream(
      this.__wbg_ptr,
      ptr0,
      len0,
      songStartSample,
      ptr1,
      len1,
      sessionId,
      randomSeed
    );
    if (ret[1]) {
      throw takeFromExternrefTable0(ret[0]);
    }
  }

  stop() {
    wasm.wasmsubsetengine_stop(this.__wbg_ptr);
  }
}

export const initSync = ({ module }) => {
  if (wasm) {
    return wasm;
  }
  const imports = getImports();
  const compiledModule = module instanceof WebAssembly.Module ? module : new WebAssembly.Module(module);
  const instance = new WebAssembly.Instance(compiledModule, imports);
  wasm = instance.exports;
  cachedUint8ArrayMemory0 = null;
  wasm.__wbindgen_start();
  return wasm;
};
