const fs = require('node:fs/promises');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const { OllamaClient } = require('../out/ollama');
const { sanitize } = require('../out/core');
const tasks = require('./tasks.cjs');

async function main() {
  const models = (process.env.MODELS || 'qwen2.5-coder:1.5b').split(',');
  const repetitions = Number(process.env.REPETITIONS || 3);
  const client = new OllamaClient(process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434');
  const installed = await client.models(AbortSignal.timeout(8000));
  const records = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.mkdir('results', { recursive: true });
  for (const model of models) for (const task of tasks) for (let repetition = 1; repetition <= repetitions; repetition++) {
    const start = performance.now(); let completion = ''; let generation; let error;
    try { generation = await client.generate(task, { model, maxTokens: 96, temperature: 0, seed: 42 }, AbortSignal.timeout(120000)); completion = sanitize(generation.response, task); }
    catch (cause) { error = String(cause); }
    const latencyMs = performance.now() - start;
    const source = task.prefix + completion + task.suffix;
    let syntaxPass = false; let syntaxCheck = 'not run';
    if (!error) {
      if (task.language === 'python') {
        const check = spawnSync('python', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: source, encoding: 'utf8' });
        syntaxPass = !check.error && check.status === 0; syntaxCheck = check.error ? 'python unavailable' : (check.stderr || 'ast.parse passed');
      } else {
        const result = ts.transpileModule(source, { fileName: task.fileName, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, allowJs: true } });
        syntaxPass = !(result.diagnostics || []).some(item => item.category === ts.DiagnosticCategory.Error);
        syntaxCheck = 'TypeScript transpilation diagnostics (not full type checking)';
      }
    }
    const matches = task.patterns.filter(pattern => completion.includes(pattern)).length;
    const patternScore = matches === task.patterns.length ? 2 : matches ? 1 : 0;
    records.push({ task: task.id, model, repetition, language: task.language, latencyMs, completion, nonEmpty: !!completion.trim(), syntaxPass, syntaxCheck, patternScore, error, evalCount: generation?.eval_count, evalDurationNs: generation?.eval_duration, totalDurationNs: generation?.total_duration, tokensPerSecond: generation?.eval_duration ? generation.eval_count / (generation.eval_duration / 1e9) : null });
    console.log(`${model} ${task.id} ${repetition}/${repetitions} ${latencyMs.toFixed(0)}ms syntax=${syntaxPass}${error ? ' ERROR ' + error : ''}`);
    await fs.writeFile(`results/${stamp}.json`, JSON.stringify({ environment: { timestamp: stamp, platform: os.platform(), arch: os.arch(), cpus: os.cpus()[0]?.model, memoryBytes: os.totalmem(), node: process.version, installedModels: installed, temperature: 0, seed: 42, maxTokens: 96 }, records }, null, 2));
  }
  const summary = models.map(model => {
    const rows = records.filter(record => record.model === model); const mean = key => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
    return { model, runs: rows.length, meanLatencyMs: mean('latencyMs'), nonEmptyRate: mean('nonEmpty'), syntaxPassRate: mean('syntaxPass'), meanPatternScore: mean('patternScore') };
  });
  await fs.writeFile(`results/${stamp}-summary.json`, JSON.stringify(summary, null, 2));
  await fs.writeFile(`results/${stamp}.csv`, 'model,task,repetition,language,latencyMs,nonEmpty,syntaxPass,patternScore\n' + records.map(row => [row.model, row.task, row.repetition, row.language, row.latencyMs, row.nonEmpty, row.syntaxPass, row.patternScore].join(',')).join('\n'));
  console.table(summary);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
