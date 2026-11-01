const assert = require('node:assert/strict');
const vscode = require('vscode');
const http = require('node:http');

exports.run = async () => {
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/tags' ? { models: [{ name: 'test-model' }] } : { response: '    return a + b' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = vscode.workspace.getConfiguration('vsHelper');
  const originals = Object.fromEntries(['endpoint', 'model', 'debounceMs', 'enabled', 'provider', 'groqManualOnly'].map(key => [key, config.inspect(key)?.globalValue]));
  let count = 0;
  const check = async (name, task) => { await task(); count++; console.log(`HOST PASS ${name}`); };
  try {
    await config.update('provider', 'ollama', true);
    await config.update('endpoint', `http://127.0.0.1:${server.address().port}`, true);
    await config.update('model', 'test-model', true); await config.update('debounceMs', 0, true); await config.update('enabled', true, true);
    const extension = vscode.extensions.getExtension('soorya-prataap-ray.vs-helper');
    assert.ok(extension); const api = await extension.activate();
    await check('activation and commands', async () => {
      const commands = await vscode.commands.getCommands(true);
      for (const command of ['toggle', 'trigger', 'testConnection', 'selectModel', 'dashboard', 'demo', 'settings', 'selectProvider', 'setGroqKey', 'removeGroqKey']) assert.ok(commands.includes(`vsHelper.${command}`));
    });
    const document = await vscode.workspace.openTextDocument({ language: 'python', content: 'def add(a, b):\n    ' });
    const token = new vscode.CancellationTokenSource(); const trigger = { triggerKind: vscode.InlineCompletionTriggerKind.Invoke };
    await check('indented blank line receives insertion', async () => {
      const items = await api.provider.provideInlineCompletionItems(document, new vscode.Position(1, 4), trigger, token.token);
      assert.equal(items[0].insertText, 'return a + b');
      const edit = new vscode.WorkspaceEdit(); edit.insert(document.uri, new vscode.Position(1, 4), items[0].insertText); await vscode.workspace.applyEdit(edit);
      assert.equal(document.getText(), 'def add(a, b):\n    return a + b');
    });
    await check('unsupported language skips inference', async () => {
      const plain = await vscode.workspace.openTextDocument({ language: 'plaintext', content: 'hello' });
      assert.deepEqual(await api.provider.provideInlineCompletionItems(plain, new vscode.Position(0, 5), trigger, token.token), []);
    });
    await check('cancelled request produces no suggestion', async () => {
      const cancelled = new vscode.CancellationTokenSource(); cancelled.cancel();
      assert.deepEqual(await api.provider.provideInlineCompletionItems(document, new vscode.Position(1, 4), trigger, cancelled.token), []); cancelled.dispose();
    });
    await check('disabled completion produces no suggestion', async () => {
      await config.update('enabled', false, true);
      assert.deepEqual(await api.provider.provideInlineCompletionItems(document, new vscode.Position(1, 4), trigger, token.token), []);
    });
    await check('Groq manual-only mode skips automatic inference', async () => {
      await config.update('enabled', true, true); await config.update('provider', 'groq', true); await config.update('groqManualOnly', true, true);
      assert.deepEqual(await api.provider.provideInlineCompletionItems(document, new vscode.Position(1, 4), { triggerKind: vscode.InlineCompletionTriggerKind.Automatic }, token.token), []);
    });
    await check('Groq missing key returns safely without inference', async () => {
      assert.deepEqual(await api.provider.provideInlineCompletionItems(document, new vscode.Position(1, 4), trigger, token.token), []);
    });
    token.dispose();
    console.log(`${count} Extension Host tests passed. Model responses in this suite are mocked.`);
  } finally {
    for (const [key, value] of Object.entries(originals)) await config.update(key, value, true);
    await new Promise(resolve => server.close(resolve));
  }
};
