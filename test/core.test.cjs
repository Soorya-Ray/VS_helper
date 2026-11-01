const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractContext, validateEndpoint, buildPrompt, sanitize, RequestCoordinator, abortableDelay } = require('../out/core');
const { OllamaClient } = require('../out/ollama');

for (const endpoint of ['http://localhost:11434', 'https://127.0.0.1:1234', 'http://[::1]:11434']) {
  test(`accept loopback ${endpoint}`, () => assert.equal(validateEndpoint(endpoint), endpoint));
}
for (const endpoint of ['https://example.com', 'http://127.0.0.1.evil.com', 'file:///tmp', 'http://192.168.1.2', 'http://user:password@localhost', 'http://localhost/?destination=remote', 'http://localhost/api', 'not a url']) {
  test(`reject unsafe endpoint ${endpoint}`, () => assert.throws(() => validateEndpoint(endpoint)));
}
test('context allocates 70% prefix and stays within budget', () => assert.deepEqual(extractContext('0123456789abcdefghij', 10, 10), { prefix: '3456789', suffix: 'abc' }));
test('unused prefix budget goes to suffix', () => assert.deepEqual(extractContext('0123456789', 2, 8), { prefix: '01', suffix: '234567' }));
test('cursor clamps to document boundary', () => { assert.equal(extractContext('abc', -5, 8).prefix, ''); assert.equal(extractContext('abc', 99, 8).prefix, 'abc'); });
test('language aware prompt excludes suffix on fallback', () => { const prompt = buildPrompt({ language: 'python', fileName: 'demo.py', prefix: 'def add(a,b):', suffix: 'SECRET_SUFFIX' }); assert.match(prompt.system, /python/); assert.match(prompt.system, /demo.py/); assert.equal(prompt.prompt, 'def add(a,b):'); assert.ok(!JSON.stringify(prompt).includes('SECRET_SUFFIX')); });
test('removes markdown fences and normalizes CRLF', () => assert.equal(sanitize('```python\r\nreturn 1\r\n```', { prefix: '', suffix: '' }), 'return 1'));
test('strips answer labels', () => assert.equal(sanitize('Here is the code:\nreturn 1', { prefix: '', suffix: '' }), 'return 1'));
test('strips exact echoed context', () => assert.equal(sanitize('def add(a,b):\n    return a+b', { prefix: 'def add(a,b):\n    ', suffix: '' }), 'return a+b'));
test('strips spacing variations in echoed last line', () => assert.equal(sanitize(' def add(a,b):\n    return a+b', { prefix: 'def add(a,b):\n    ', suffix: '' }), 'return a+b'));
test('does not double existing indentation', () => assert.equal(sanitize('    return 1\n    # next', { prefix: 'def f():\n    ', suffix: '' }), 'return 1\n    # next'));
test('removes overlap with text after cursor', () => assert.equal(sanitize('return 1;\n}', { prefix: 'function f(){\n    ', suffix: '\n}' }), 'return 1;'));
test('stops at echoed suffix boundary before unrelated functions', () => assert.equal(sanitize('return 1;\n}\n\nfunction unrelated() {}', { prefix: 'function f(){\n    ', suffix: '\n}' }), 'return 1;'));
test('preserves a nested closing brace before the real suffix boundary', () => assert.equal(sanitize('if (ok) {\n        return 1;\n    }\n    return 0;\n}\nfunction unrelated() {}', { prefix: 'function f(){\n    ', suffix: '\n}' }), 'if (ok) {\n        return 1;\n    }\n    return 0;'));
test('normalizes first-line model indentation to existing cursor indentation', () => assert.equal(sanitize('     return 1', { prefix: 'def f():\n    ', suffix: '' }), 'return 1'));
test('caps completion lines and characters', () => { assert.equal(sanitize('x\n'.repeat(40), { prefix: '', suffix: '' }).split('\n').length, 20); assert.equal(sanitize('x'.repeat(5000), { prefix: '', suffix: '' }).length, 4000); });
test('superseded document generation is aborted', async () => {
  const coordinator = new RequestCoordinator(); const outer = new AbortController();
  const first = coordinator.run('doc', 0, 1000, outer.signal, async signal => { await abortableDelay(100, signal); return 'stale'; });
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = coordinator.run('doc', 0, 1000, outer.signal, async () => 'new');
  assert.equal(await second, 'new'); await rejected;
});
test('independent documents do not cancel each other', async () => {
  const coordinator = new RequestCoordinator(); const signal = new AbortController().signal;
  assert.deepEqual(await Promise.all([coordinator.run('a', 0, 1000, signal, async () => 1), coordinator.run('b', 0, 1000, signal, async () => 2)]), [1, 2]);
});
test('editor cancellation aborts pending debounce', async () => {
  const outer = new AbortController(); const coordinator = new RequestCoordinator();
  const work = coordinator.run('doc', 200, 1000, outer.signal, async () => assert.fail('must not infer'));
  outer.abort(); await assert.rejects(work, { name: 'AbortError' });
});
test('timeout has a distinct error', async () => {
  const coordinator = new RequestCoordinator();
  await assert.rejects(coordinator.run('doc', 0, 15, new AbortController().signal, async signal => abortableDelay(1000, signal)), /timed out/);
});
test('transport lists installed models', async () => {
  const client = new OllamaClient('http://localhost', async (url, init) => { assert.match(url, /\/api\/tags$/); assert.equal(init.redirect, 'manual'); return Response.json({ models: [{ name: 'qwen:latest' }] }); });
  assert.equal((await client.models())[0].name, 'qwen:latest');
});
test('redirect is blocked before reading response', async () => {
  const client = new OllamaClient('http://localhost', async () => new Response(null, { status: 302, headers: { location: 'https://example.com' } }));
  await assert.rejects(client.models(), /redirects.*blocked/);
});
test('invalid JSON is reported clearly', async () => {
  const client = new OllamaClient('http://localhost', async () => new Response('bad'));
  await assert.rejects(client.models(), /invalid JSON/);
});
test('missing model error preserved', async () => {
  const client = new OllamaClient('http://localhost', async () => Response.json({ error: 'model missing not found' }, { status: 404 }));
  await assert.rejects(client.generate({ language: 'python', fileName: 'a.py', prefix: 'x=', suffix: '' }, { model: 'missing', maxTokens: 96, temperature: .1 }), /model missing/);
});
test('unsupported suffix retries once then caches model capability', async () => {
  const bodies = []; const client = new OllamaClient('http://localhost', async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    return body.suffix ? Response.json({ error: 'model does not support insert' }, { status: 400 }) : Response.json({ response: '1' });
  });
  const context = { language: 'python', fileName: 'a.py', prefix: 'x=', suffix: '\nprint(x)' }; const options = { model: 'qwen', maxTokens: 96, temperature: .1 };
  await client.generate(context, options); await client.generate(context, options);
  assert.equal(bodies.length, 3); assert.ok(bodies[0].suffix); assert.ok(!bodies[1].suffix); assert.ok(!bodies[2].suffix); assert.equal(bodies[1].prompt, 'x=');
});
test('connection failure gives actionable message', async () => {
  const client = new OllamaClient('http://localhost', async () => { throw new Error('ECONNREFUSED'); });
  await assert.rejects(client.models(), /Start Ollama/);
});
