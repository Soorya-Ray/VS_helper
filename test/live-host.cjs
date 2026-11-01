const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const vm = require('node:vm');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');

exports.run = async () => {
  const config = vscode.workspace.getConfiguration('vsHelper');
  const keys = ['provider', 'endpoint', 'model', 'enabled', 'debounceMs', 'timeoutMs'];
  const originals = Object.fromEntries(keys.map(key => [key, config.inspect(key)?.globalValue]));
  const records = [];
  try {
    for (const [key, value] of Object.entries({ provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: process.env.OLLAMA_TEST_MODEL || 'qwen2.5-coder:1.5b', enabled: true, debounceMs: 0, timeoutMs: 120000 })) await config.update(key, value, true);
    const extension = vscode.extensions.getExtension('soorya-prataap-ray.vs-helper');
    assert.ok(extension); const api = await extension.activate();
    const tasks = [
      { language: 'python', prefix: '# Return the sum of two numbers.\ndef add(a, b):\n    ', suffix: '', verify: source => {
        const result = spawnSync('python', ['-c', source + '\nassert add(2, 3) == 5\nassert add(-4, 1) == -3'], { encoding: 'utf8', timeout: 5000 });
        assert.equal(result.status, 0, result.stderr || String(result.error || 'Python check failed'));
      } },
      { language: 'javascript', prefix: '// Return only even numbers.\nfunction filterEven(numbers) {\n    ', suffix: '\n}', verify: source => {
        const result = vm.runInNewContext(source + '; JSON.stringify(filterEven([1, 2, 3, 4]))', {}, { timeout: 1000 });
        assert.equal(result, '[2,4]');
      } },
      { language: 'typescript', prefix: '// Clamp value between min and max.\nfunction clamp(value: number, min: number, max: number): number {\n    ', suffix: '\n}', verify: source => {
        const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
        assert.equal(vm.runInNewContext(js + '; JSON.stringify([clamp(-2,0,10),clamp(12,0,10),clamp(5,0,10)])', {}, { timeout: 1000 }), '[0,10,5]');
      } }
    ];
    for (const task of tasks) {
      const document = await vscode.workspace.openTextDocument({ language: task.language, content: task.prefix + task.suffix });
      await vscode.window.showTextDocument(document);
      const position = document.positionAt(task.prefix.length);
      const cancellation = new vscode.CancellationTokenSource(); const start = Date.now();
      const items = await api.provider.provideInlineCompletionItems(document, position, { triggerKind: vscode.InlineCompletionTriggerKind.Invoke }, cancellation.token);
      assert.ok(items?.length, `No live ${task.language} insertion; check the VS_helper output log.`);
      const insertion = items[0].insertText; assert.equal(typeof insertion, 'string');
      const edit = new vscode.WorkspaceEdit(); edit.insert(document.uri, position, insertion); assert.equal(await vscode.workspace.applyEdit(edit), true);
      const source = document.getText();
      task.verify(source);
      const record = { language: task.language, elapsedMs: Date.now() - start, insertion, source, functionalCheck: 'passed', provider: 'real local Ollama' };
      records.push(record); console.log(`LIVE PASS ${task.language}: ${record.elapsedMs}ms ${JSON.stringify(insertion)}`);
      cancellation.dispose();
    }
    // Exercise the actual native ghost-text pipeline and native acceptance command.
    const nativeDocument = await vscode.workspace.openTextDocument({ language: 'python', content: '# Return the sum of two numbers.\ndef add(a, b):\n    ' });
    const editor = await vscode.window.showTextDocument(nativeDocument);
    const cursor = nativeDocument.positionAt(nativeDocument.getText().length);
    editor.selection = new vscode.Selection(cursor, cursor);
    const initialCount = api.getStats().received;
    const nativeStart = Date.now();
    await vscode.commands.executeCommand('vsHelper.trigger');
    const deadline = Date.now() + 120000;
    while (api.getStats().received <= initialCount && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(api.getStats().received > initialCount, 'Native inline trigger did not generate a suggestion');
    await new Promise(resolve => setTimeout(resolve, 500));
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    assert.ok(nativeDocument.getText().length > cursor.character + nativeDocument.offsetAt(new vscode.Position(cursor.line, 0)), 'Native ghost-text acceptance did not insert code');
    tasks[0].verify(nativeDocument.getText());
    records.push({ language: 'python', elapsedMs: Date.now() - nativeStart, source: nativeDocument.getText(), nativeInlineTriggerAndCommit: 'passed', provider: 'real local Ollama' });
    console.log('LIVE PASS native inline trigger and acceptance');
    await fs.mkdir(path.resolve(__dirname, '../results'), { recursive: true });
    await fs.writeFile(path.resolve(__dirname, '../results/live-extension-test.json'), JSON.stringify({ timestamp: new Date().toISOString(), model: config.get('model'), note: 'Real Ollama inference through the Extension Host provider with insertion and functional checks, followed by the native inline trigger and commit commands. Physical keyboard input and screenshot inspection are not automated.', records }, null, 2));
    console.log('4 real Ollama Extension Host completion tests passed, including native trigger/commit.');
  } finally {
    for (const [key, value] of Object.entries(originals)) await config.update(key, value, true);
  }
};
