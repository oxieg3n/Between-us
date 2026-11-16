import { buildLocalPrompt, type LocalModelAdapter } from "./journal-intelligence";

export const LOCAL_MODEL = Object.freeze({
  name: "SmolLM2 360M Instruct · Q8_0",
  license: "Apache-2.0",
  bytes: 386404992,
  sha256: "48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201",
  filename: "smollm2-360m-instruct-q8_0.gguf",
  url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf?download=true",
});

export type LocalModelStatus = { available: boolean; ready: boolean; message: string };
type ChatMessage = { role: "system" | "user"; content: string };
export type LocalCompletionOptions = {
  prompt: string;
  n_predict: number;
  n_threads: number;
  temperature: number;
  seed: number;
  stop: string[];
  response_format: { type: "json_schema"; json_schema: { strict: true; schema: object } };
};

/** Reviewed subset of llama.rn 0.13.0-rc.11; no session persistence APIs. */
export interface PrivateModelContext {
  getFormattedChat(messages: ChatMessage[]): Promise<{ prompt: string }>;
  tokenize(text: string): Promise<{ tokens: number[] }>;
  completion(options: LocalCompletionOptions): Promise<{ text: string }>;
  stopCompletion(): Promise<void>;
  clearCache(clearData: boolean): Promise<void>;
  release(): Promise<void>;
}

const outputSchema = {
  type: "object", additionalProperties: false, required: ["suggestions"],
  properties: { suggestions: {
    type: "array", minItems: 1, maxItems: 1,
    items: {
      type: "object", additionalProperties: false,
      required: ["draft", "recipientCategory", "route"],
      properties: {
        draft: { type: "string", minLength: 8, maxLength: 280 },
        recipientCategory: { type: "string", enum: ["trusted-person"] },
        route: { type: "string", enum: ["in-person"] },
      },
    },
  } },
};

export function modelAssetMatches(bytes: number, digest: string): boolean {
  return bytes === LOCAL_MODEL.bytes && digest === LOCAL_MODEL.sha256;
}

/** Expo move() mutates a File's URI; cleanup must retain the original download path. */
export async function withModelDownloadFile(
  file: { uri: string },
  open: (uri: string) => { exists: boolean; delete(): void },
  work: () => Promise<void>,
) {
  const downloadUri = file.uri;
  try { await work(); }
  finally {
    const unfinished = open(downloadUri);
    if (unfinished.exists) unfinished.delete();
  }
}

/** Serializes native calls and clears prompt/KV tensor data before another author can run. */
export function createPrivateModelAdapter(access: {
  context: () => PrivateModelContext | undefined;
  version: () => number;
  retire: (context: PrivateModelContext) => Promise<void>;
}) {
  let queue: Promise<void> = Promise.resolve();
  let active: PrivateModelContext | undefined;
  const adapter: LocalModelAdapter = {
    generate(request, signal) {
      const version = access.version();
      const work = queue.then(async () => {
        const context = access.context();
        const cancelled = () => signal.aborted || access.version() !== version;
        if (!context || cancelled()) throw new Error("On-device generation is unavailable or cancelled.");
        if (!request.text.trim() || request.text.length > 5000) throw new Error("This writing cannot use the local model.");
        const stop = () => { void context.stopCompletion().catch(() => undefined); };
        active = context;
        signal.addEventListener("abort", stop, { once: true });
        try {
          await context.clearCache(true);
          if (cancelled()) throw new Error();
          const formatted = await context.getFormattedChat(buildLocalPrompt(request));
          if (cancelled()) throw new Error();
          const { tokens } = await context.tokenize(formatted.prompt);
          if (tokens.length > 840 || cancelled()) throw new Error();
          const result = await context.completion({
            prompt: formatted.prompt, n_predict: 128, n_threads: 2,
            temperature: 0.2, seed: 7, stop: ["<|im_end|>", "<|endoftext|>"],
            response_format: { type: "json_schema", json_schema: { strict: true, schema: outputSchema } },
          });
          if (cancelled() || typeof result.text !== "string" || result.text.length > 3000) throw new Error();
          return result.text;
        } catch {
          // Native errors may include private prompts; expose only fixed app-authored wording.
          throw new Error("On-device generation could not finish safely. Local starters remain available.");
        } finally {
          signal.removeEventListener("abort", stop);
          try { await context.clearCache(true); }
          catch { await access.retire(context); }
          active = undefined;
        }
      });
      queue = work.then(() => undefined, () => undefined);
      return work;
    },
  };
  async function stopAndDrain() {
    try { await active?.stopCompletion(); } catch { /* Await completion settlement before release. */ }
    await queue;
  }
  return { adapter, stopAndDrain };
}
