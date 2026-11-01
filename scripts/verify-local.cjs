const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const { OllamaClient } = require('../out/ollama');
const { sanitize } = require('../out/core');
const fixtures = require('../benchmark/tasks.cjs');

async function main() {
  const client = new OllamaClient('http://127.0.0.1:11434');
  const model = 'qwen2.5-coder:1.5b';
  const models = await client.models(AbortSignal.timeout(10000));
  assert.ok(models.some(item => item.name === model), 'Local model is not installed');
  const records = [];
  await fs.mkdir('results', { recursive: true });
  for (const id of ['py-add', 'js-even', 'ts-clamp']) {
    const fixture = fixtures.find(task => task.id === id);
    const start = performance.now();
    const result = await client.generate(fixture, { model, maxTokens: 96, temperature: .1, seed: 42 }, AbortSignal.timeout(120000));
    const insertion = sanitize(result.response, fixture);
    const source = fixture.prefix + insertion + fixture.suffix;
    const record = { id, provider: 'real local Ollama', model, latencyMs: performance.now() - start, raw: result.response, insertion, source, evalCount: result.eval_count, functionalCheck: 'pending' };
    records.push(record);
    try {
      assert.ok(insertion.trim(), 'No completion returned');
      if (id === 'py-add') {
        const check = spawnSync('python', ['-c', source + '\nassert add(2,3) == 5\nassert add(-4,1) == -3'], { encoding: 'utf8', timeout: 5000 });
        assert.equal(check.status, 0, check.stderr || String(check.error || 'Python failed'));
      } else if (id === 'js-even') {
        assert.equal(vm.runInNewContext(source + ';JSON.stringify(even([1,2,3,4]))', {}, { timeout: 1000 }), '[2,4]');
      } else {
        const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
        assert.equal(vm.runInNewContext(js + ';JSON.stringify([clamp(-2,0,10),clamp(12,0,10),clamp(5,0,10)])', {}, { timeout: 1000 }), '[0,10,5]');
      }
      record.functionalCheck = 'passed';
      console.log(`LOCAL PASS ${id} ${record.latencyMs.toFixed(0)}ms ${JSON.stringify(insertion)}`);
    } catch (error) { record.functionalCheck = 'failed'; record.error = String(error); throw error; }
    finally { await fs.writeFile('results/local-verification.json', JSON.stringify({ timestamp: new Date().toISOString(), models, records }, null, 2)); }
  }
  console.log('3 real local-model functional checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
