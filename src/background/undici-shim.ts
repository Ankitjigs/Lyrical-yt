// Shim for undici in browser environment
export const fetch = globalThis.fetch.bind(globalThis);

export class ProxyAgent {
  constructor() {
    console.warn("ProxyAgent is not supported in browser extension");
  }
}
