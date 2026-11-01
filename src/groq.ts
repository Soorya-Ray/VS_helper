import { buildPrompt, CodeContext } from './core';
import { Generation, GenerationOptions, LocalModel } from './ollama';

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1';
export const GROQ_DEMO_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];

/** Explicit cloud demo adapter. Ollama's loopback policy is never relaxed. */
export class GroqClient {
  readonly endpoint = GROQ_ENDPOINT;
  private retryAfter = 0;
  constructor(private apiKey: string, private request: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error('Groq API key is missing. Run VS_helper: Set Groq API Key.');
  }
  private async json(path: string, init: RequestInit): Promise<any> {
    if (Date.now() < this.retryAfter) throw new Error(`Groq rate limit: wait ${Math.ceil((this.retryAfter - Date.now()) / 1000)} seconds before retrying.`);
    let response: Response;
    try {
      response = await this.request(GROQ_ENDPOINT + path, { ...init, redirect: 'manual', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` } });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new Error('Groq is unavailable. Check your internet connection and try again.');
    }
    if (response.status >= 300 && response.status < 400) throw new Error('Groq redirect blocked. API keys are sent only to api.groq.com.');
    if (response.status === 401 || response.status === 403) throw new Error('Groq authentication or permission error. Check your key and model permissions in Groq Console.');
    if (response.status === 429) {
      const seconds = Math.min(86400, Math.max(2, Number(response.headers.get('retry-after')) || 60));
      this.retryAfter = Date.now() + seconds * 1000;
      throw new Error(`Groq free-plan rate limit reached. Wait ${seconds} seconds or check your account limits. No automatic retries will be sent.`);
    }
    if (!response.ok) throw new Error(`Groq HTTP ${response.status}. Check the selected model and your Groq account. Request details and API keys are omitted from logs.`);
    try { return await response.json(); }
    catch { throw new Error('Groq returned invalid JSON.'); }
  }
  async models(signal?: AbortSignal): Promise<LocalModel[]> {
    const data = await this.json('/models', { signal });
    if (!Array.isArray(data.data)) throw new Error('Groq returned an invalid model list.');
    return data.data.filter((model: { id?: string; active?: boolean }) => model.active !== false && GROQ_DEMO_MODELS.includes(model.id || '')).map((model: { id: string }) => ({ name: model.id }));
  }
  async generate(context: CodeContext, options: GenerationOptions, signal?: AbortSignal): Promise<Generation> {
    // Send a basename rather than a full local filesystem path in cloud mode.
    const safeContext = { ...context, fileName: context.fileName.split(/[\\/]/).at(-1)! };
    const prompt = buildPrompt(safeContext);
    const body: Record<string, unknown> = {
      model: options.model, stream: false, temperature: options.temperature,
      max_completion_tokens: options.maxTokens,
      messages: [
        { role: 'system', content: prompt.system + ' The user supplies code before and after a cursor. Return only the insertion at that cursor, excluding existing prefix and suffix.' },
        { role: 'user', content: `CODE BEFORE CURSOR:\n${safeContext.prefix}\n<INSERT HERE>\nCODE AFTER CURSOR:\n${safeContext.suffix}` }
      ]
    };
    if (options.model.startsWith('openai/gpt-oss')) { body.reasoning_effort = 'low'; body.include_reasoning = false; }
    if (options.model === 'qwen/qwen3.8-27b') { body.reasoning_effort = 'none'; body.reasoning_format = 'hidden'; }
    const data = await this.json('/chat/completions', { method: 'POST', body: JSON.stringify(body), signal });
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Groq returned no code. Increase the Groq token budget or try another supported model.');
    return { response: text, eval_count: data.usage?.completion_tokens };
  }
}
