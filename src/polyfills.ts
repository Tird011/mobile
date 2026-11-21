// three's GLTFLoader needs TextDecoder; older Hermes builds don't ship it.
if (typeof (globalThis as any).TextDecoder === 'undefined') {
  class Utf8Decoder {
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return '';
      const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '', i = 0;
      while (i < bytes.length) {
        const b = bytes[i++];
        if (b < 0x80) out += String.fromCharCode(b);
        else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if (b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else {
          const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
          const c = cp - 0x10000;
          out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
        }
      }
      return out;
    }
  }
  (globalThis as any).TextDecoder = Utf8Decoder;
}
export {};
