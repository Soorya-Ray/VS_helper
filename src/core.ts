export interface CodeContext { prefix: string; suffix: string; language: string; fileName: string }

export function extractContext(text: string, offset: number, budget = 6000): Pick<CodeContext, 'prefix' | 'suffix'> {
  const cursor = Math.max(0, Math.min(text.length, Math.trunc(offset)));
  const size = Math.max(0, Math.trunc(budget));
  const prefix = text.slice(Math.max(0, cursor - Math.ceil(size * 0.7)), cursor);
  return { prefix, suffix: text.slice(cursor, cursor + size - prefix.length) };
}

export function validateEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid Ollama endpoint URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Privacy check: Ollama endpoint must use HTTP(S) on localhost, 127.0.0.1 or ::1.');
  }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Ollama endpoint must be a local origin without credentials, path, query or fragment.');
  }
  return url.origin;
}

export function buildPrompt(context: CodeContext): { system: string; prompt: string } {
  return {
    system: `You are an inline ${context.language} code completion engine. Continue the source code exactly at the cursor. Return only the missing code, no Markdown, explanations, or repeated existing code. Preserve indentation. Prefer a short, complete statement or function body. Active file: ${context.fileName}`,
    prompt: context.prefix
  };
}

export function sanitize(raw: string, context: Pick<CodeContext, 'prefix' | 'suffix'>): string {
  let result = raw.replace(/\r\n?/g, '\n').trimEnd();
  result = result.replace(/^\s*```[^\n]*\n/, '').replace(/\n?```\s*$/, '');
  result = result.replace(/^(?:Here(?:'s| is)[^\n]*:|(?:Completion|Code|Answer):)\s*\n?/i, '');
  if (result.startsWith(context.prefix)) result = result.slice(context.prefix.length);
  else {
    const anchor = context.prefix.trimEnd().split('\n').filter(line => line.trim()).at(-1);
    if (anchor && anchor.trim().length > 4) {
      const lines = result.split('\n');
      const match = lines.findIndex(line => line.trim() === anchor.trim());
      if (match >= 0 && match < 4) result = lines.slice(match + 1).join('\n');
    }
  }
  // Remove indentation already supplied before the cursor; preserve subsequent lines.
  const currentLine = context.prefix.split('\n').at(-1) || '';
  if (/^[\t ]+$/.test(currentLine)) {
    result = result.replace(/^[\t ]+/, '');
  }
  // Infill models can echo the existing boundary and continue into unrelated code.
  // Match the full line's indentation so nested closing braces remain intact.
  const suffixAnchor = context.suffix.replace(/\r\n?/g, '\n').split('\n').find(line => line.trim());
  if (suffixAnchor) {
    const lines = result.split('\n');
    const boundary = lines.findIndex(line => line.trimEnd() === suffixAnchor.trimEnd());
    if (boundary >= 0) result = lines.slice(0, boundary).join('\n');
  }
  for (let size = Math.min(result.length, context.suffix.length); size > 0; size--) {
    if (result.endsWith(context.suffix.slice(0, size))) { result = result.slice(0, -size); break; }
  }
  return result.split('\n').slice(0, 20).join('\n').slice(0, 4000).trimEnd();
}

export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}

export class RequestCoordinator {
  private requests = new Map<string, AbortController>();
  async run<T>(key: string, delay: number, timeout: number, outer: AbortSignal, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.cancel(key);
    const controller = new AbortController();
    this.requests.set(key, controller);
    const abort = () => controller.abort();
    outer.addEventListener('abort', abort, { once: true });
    if (outer.aborted) controller.abort();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      await abortableDelay(delay, controller.signal);
      deadline = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
      const value = await task(controller.signal);
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return value;
    } catch (error) {
      if (timedOut) throw new Error(`Local inference timed out after ${timeout / 1000}s. Try a smaller model or increase the timeout.`);
      throw error;
    } finally {
      clearTimeout(deadline);
      outer.removeEventListener('abort', abort);
      if (this.requests.get(key) === controller) this.requests.delete(key);
    }
  }
  cancel(key: string): void { this.requests.get(key)?.abort(); this.requests.delete(key); }
  cancelAll(): void { for (const key of this.requests.keys()) this.cancel(key); }
}
