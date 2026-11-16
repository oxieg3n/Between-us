/** The browser must never import SQLite, its WASM worker or native vault code. */
export async function checkNativeStorage(): Promise<Record<string,unknown>> {
  return {available:false,reason:'Native development builds only.'};
}
