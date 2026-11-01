const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GroqClient, GROQ_ENDPOINT } = require('../out/groq');
const context = { language: 'python', fileName: 'C:\\private\\project\\add.py', prefix: 'def add(a,b):\n    ', suffix: '\n# end' };
const options = { model: 'openai/gpt-oss-20b', maxTokens: 1024, temperature: .1 };

test('Groq requires an explicit API key', () => assert.throws(() => new GroqClient(''), /key is missing/));
test('Groq completion uses fixed HTTPS destination and hides reasoning', async () => {
  const client = new GroqClient('test-key', async (url, init) => {
    assert.equal(url, GROQ_ENDPOINT + '/chat/completions'); assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(init.body); assert.equal(body.max_completion_tokens, 1024); assert.equal(body.include_reasoning, false); assert.equal(body.reasoning_effort, 'low');
    assert.ok(!JSON.stringify(body).includes('private')); assert.match(body.messages[0].content, /add.py/); assert.match(body.messages[1].content, /CODE AFTER CURSOR/);
    return Response.json({ choices: [{ message: { content: 'return a + b', reasoning: 'must never become code' } }], usage: { completion_tokens: 10 } });
  });
  assert.deepEqual(await client.generate(context, options), { response: 'return a + b', eval_count: 10 });
});
test('Groq discovery excludes audio and non-completion models', async () => {
  const client = new GroqClient('test-key', async () => Response.json({ data: [{ id: 'openai/gpt-oss-20b', active: true }, { id: 'whisper-large-v3', active: true }, { id: 'qwen/qwen3.8-27b', active: false }] }));
  assert.deepEqual(await client.models(), [{ name: 'openai/gpt-oss-20b' }]);
});
test('Groq blocks redirect without forwarding credentials', async () => {
  const client = new GroqClient('secret-value', async () => new Response(null, { status: 302, headers: { location: 'https://example.com' } }));
  await assert.rejects(client.models(), /redirect blocked/);
});
test('Groq rate limits enter cooldown and do not retry automatically', async () => {
  let calls = 0;
  const client = new GroqClient('test-key', async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '3' } }); });
  await assert.rejects(client.generate(context, options), /Wait 3 seconds/);
  await assert.rejects(client.generate(context, options), /wait \d seconds/);
  assert.equal(calls, 1);
});
test('Groq authentication failures omit API key and response body', async () => {
  const client = new GroqClient('secret-value', async () => Response.json({ error: 'secret-value echoed source' }, { status: 401 }));
  await assert.rejects(client.models(), error => /authentication/.test(error.message) && !error.message.includes('secret-value'));
});
test('Groq rejects malformed or missing completion content', async () => {
  const client = new GroqClient('test-key', async () => Response.json({ choices: [{ message: { content: null } }] }));
  await assert.rejects(client.generate(context, options), /no code/);
});
test('Groq cancellation preserves the abort error', async () => {
  const outer = new AbortController(); outer.abort();
  const client = new GroqClient('test-key', async (_url, init) => { init.signal.throwIfAborted(); });
  await assert.rejects(client.generate(context, options, outer.signal), { name: 'AbortError' });
});
