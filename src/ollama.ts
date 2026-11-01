import { buildPrompt, CodeContext, validateEndpoint } from './core';

export interface GenerationOptions { model: string; maxTokens: number; temperature: number; seed?: number }
export interface Generation { response: string; eval_count?: number; eval_duration?: number; total_duration?: number }
export interface LocalModel { name: string; size?: number; digest?: string; details?: { parameter_size?: string; quantization_level?: string } }

export class OllamaClient {
  readonly endpoint: string;
  private noSuffix = new Set<string>();
  constructor(endpoint: string, private request: typeof fetch = fetch) { this.endpoint = validateEndpoint(endpoint); }
  private async json(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try { response = await this.request(this.endpoint + path, { ...init, redirect: 'manual' }); }
    catch (error) {
      if (init.signal?.aborted) throw error;
      throw new Error('Ollama is unavailable. Start Ollama on this computer, then test the connection.');
    }
    if (response.status >= 300 && response.status < 400) throw new Error('Privacy check: redirects from Ollama are blocked.');
    let data: Record<string, unknown>;
    try { data = await response.json() as Record<string, unknown>; }
    catch { throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}).`); }
    if (!response.ok || data.error) throw new Error(String(data.error || `Ollama HTTP ${response.status}`));
    return data;
  }
  async models(signal?: AbortSignal): Promise<LocalModel[]> {
    const data = await this.json('/api/tags', { signal });
    if (!Array.isArray(data.models)) throw new Error('Invalid Ollama model list.');
    return data.models.filter((model): model is LocalModel => typeof model?.name === 'string');
  }
  async generate(context: CodeContext, options: GenerationOptions, signal?: AbortSignal): Promise<Generation> {
    const prompt = buildPrompt(context);
    const suffixLine = context.suffix.split('\n').find(line => line.trim());
    const stop = ['```'];
    // A real closing delimiter at this indentation marks the end of an insertion.
    if (suffixLine && /^\s*[}\])];?\s*$/.test(suffixLine)) stop.push('\n' + suffixLine.trimEnd());
    const body: Record<string, unknown> = {
      ...prompt, model: options.model, stream: false, keep_alive: '5m',
      options: { temperature: options.temperature, num_predict: options.maxTokens, seed: options.seed, stop }
    };
    if (context.suffix.trim() && !this.noSuffix.has(options.model)) body.suffix = context.suffix;
    const send = () => this.json('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    let data: Record<string, unknown>;
    try { data = await send(); }
    catch (error) {
      if (body.suffix && /(?:insert|suffix|infill).*(?:support|unavailable)|(?:support).*(?:insert|suffix|infill)/i.test(String(error))) {
        this.noSuffix.add(options.model); delete body.suffix; data = await send();
      } else throw error;
    }
    if (typeof data.response !== 'string') throw new Error('Ollama response is missing generated text.');
    return data as unknown as Generation;
  }
}
