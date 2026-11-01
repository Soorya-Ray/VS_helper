import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { extractContext, RequestCoordinator, sanitize, validateEndpoint } from './core';
import { OllamaClient } from './ollama';
import { GroqClient } from './groq';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('VS_helper');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'vsHelper.dashboard'; status.show();
  const coordinator = new RequestCoordinator();
  let client: OllamaClient | undefined;
  let groqClient: GroqClient | undefined;
  let panel: vscode.WebviewPanel | undefined;
  let state = 'Ready';
  let detail = 'Ctrl+Alt+Enter to request a suggestion from the selected provider.';
  let received = 0; let accepted = 0; let lastMs = 0; let health = 'Not checked';
  let latestRequest = 0;
  const config = () => vscode.workspace.getConfiguration('vsHelper');
  const cloud = () => config().get<string>('provider') === 'groq';
  const modelName = () => config().get<string>(cloud() ? 'groqModel' : 'model')!;
  const providerName = () => cloud() ? 'Groq cloud demo' : 'Ollama local';
  const target = () => vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  const getClient = async () => {
    if (cloud()) {
      if (!groqClient) groqClient = new GroqClient(await context.secrets.get('vsHelper.groqApiKey') || '');
      return groqClient;
    }
    const endpoint = validateEndpoint(config().get<string>('endpoint')!);
    if (!client || client.endpoint !== endpoint) client = new OllamaClient(endpoint);
    return client;
  };
  const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  function renderDashboard() {
    if (!panel) return;
    const nonce = randomBytes(16).toString('hex');
    const settings = config();
    const enabled = settings.get<boolean>('enabled');
    const isCloud = cloud();
    panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
      *{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);line-height:1.6}
      main{max-width:1050px;margin:auto;padding:45px 40px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:24px}.brand{font-size:23px;letter-spacing:-1px;font-weight:700}.brand span{color:#74d9b4}.label{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--vscode-descriptionForeground)}.pill{border:1px solid #397e68;border-radius:20px;padding:6px 13px;color:#74d9b4;font-size:12px}
      h1{font-size:40px;line-height:1.2;letter-spacing:-1.5px;margin:35px 0 12px;font-weight:600}p{color:var(--vscode-descriptionForeground);max-width:640px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:30px 0}.card,.surface{border:1px solid var(--vscode-panel-border);border-radius:10px;background:var(--vscode-sideBar-background);padding:22px}.value{font-size:24px;margin-top:10px;overflow-wrap:anywhere}.sub{font-size:12px;color:var(--vscode-descriptionForeground)}.split{display:grid;grid-template-columns:1.15fr 1fr;gap:18px}h2{font-size:17px;margin:0 0 18px}button{font:inherit;font-size:12px;border-radius:5px;border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:10px 14px;cursor:pointer;margin:4px 5px 4px 0}button:hover{background:var(--vscode-button-hoverBackground)}.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}.row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--vscode-panel-border);font-size:13px}.row span:last-child{text-align:right;overflow-wrap:anywhere}.code{font-family:var(--vscode-editor-font-family);font-size:13px;padding:18px;background:var(--vscode-editor-background);border-radius:6px;color:#74d9b4;margin:14px 0}kbd{font:12px var(--vscode-editor-font-family);background:var(--vscode-editor-background);padding:3px 7px;border:1px solid var(--vscode-panel-border);border-radius:4px}footer{margin-top:25px;font-size:12px;color:var(--vscode-descriptionForeground)}@media(max-width:700px){main{padding:24px}.grid,.split{grid-template-columns:1fr}h1{font-size:30px}}
    </style></head><body><main>
      <header><div class="brand">VS<span>_helper</span> <span class="label">/ code intelligence</span></div><div class="pill">● ${isCloud ? 'Groq cloud demo · online' : 'Local inference only'}</div></header>
      <div class="label" style="margin-top:34px">${isCloud ? 'Demo provider · Groq API' : 'Your editor. Your model. Your machine.'}</div>
      <h1>Code with context.<br>${isCloud ? 'See it in action.' : 'Keep it local.'}</h1><p>${isCloud ? 'Cloud demo mode sends nearby code to Groq. Internet and your own API key are required. Free-plan limits apply. This mode demonstrates the editor interface; use Ollama to demonstrate the reports’ local privacy architecture.' : 'Inline suggestions for Python, JavaScript and TypeScript, powered by Ollama on this computer.'} Review the ghost text, then press Tab to accept.</p>
      <div class="grid"><div class="card"><div class="label">Extension status</div><div class="value">${escape(enabled ? state : 'Disabled')}</div><div class="sub">${escape(detail)}</div></div>
      <div class="card"><div class="label">Active model</div><div class="value">${escape(modelName())}</div><div class="sub">${providerName()} · ${escape(health)}</div></div>
      <div class="card"><div class="label">Last completion</div><div class="value">${lastMs ? (lastMs / 1000).toFixed(2) + ' s' : '—'}</div><div class="sub">${received} suggestions · ${accepted} accepted this session</div></div></div>
      <div class="split"><section class="surface"><h2>Provider controls</h2><button data-command="testConnection">Test connection</button><button data-command="selectProvider" class="secondary">Select provider</button><button data-command="selectModel" class="secondary">Select model</button>${isCloud ? '<button data-command="setGroqKey" class="secondary">Set Groq API key</button><button data-command="removeGroqKey" class="secondary">Remove API key</button>' : ''}<button data-command="toggle" class="secondary">${enabled ? 'Disable' : 'Enable'} completion</button>
      <div class="row"><span>Destination</span><span>${escape(isCloud ? 'https://api.groq.com' : settings.get('endpoint'))}</span></div><div class="row"><span>Request mode</span><span>${isCloud && settings.get('groqManualOnly') ? 'Manual · Ctrl+Alt+Enter' : `Automatic · ${escape(settings.get('debounceMs'))} ms debounce`}</span></div><div class="row"><span>Context budget</span><span>${escape(settings.get('contextCharacters'))} characters</span></div><div class="row"><span>Network policy</span><span>${isCloud ? 'Groq HTTPS only · redirects blocked' : 'Loopback hosts · redirects blocked'}</span></div><button data-command="settings" class="secondary">All settings</button><button data-command="logs" class="secondary">View request log</button></section>
      <section class="surface"><h2>Ready for a suggestion?</h2><div class="code">def add(a, b):<br>&nbsp;&nbsp;&nbsp;&nbsp;<span style="opacity:.5">return a + b</span></div><p>The code above illustrates ghost text. Live suggestions appear in your editor using the selected provider.</p><p>Open a demo file, place the cursor after its indentation, and press <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Enter</kbd>. Accept with <kbd>Tab</kbd>, dismiss with <kbd>Esc</kbd>.</p><button data-command="demo">Open demo workspace</button></section></div>
      <footer>Active document context only · No analytics · ${isCloud ? 'Cloud demo: code context is sent to Groq' : 'Local Ollama inference'} · Generated code remains subject to your review</footer>
    </main><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('button[data-command]').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({command:button.dataset.command})));</script></body></html>`;
  }

  function update(next: string, message: string) {
    state = next; detail = message;
    const enabled = config().get<boolean>('enabled');
    status.text = !enabled ? '$(circle-slash) VS_helper: Off' : `${next === 'Generating' ? '$(sync~spin)' : next === 'Error' ? '$(warning)' : cloud() ? '$(cloud)' : '$(sparkle)'} VS_helper${cloud() ? ' [Groq]' : ''}: ${next}`;
    status.tooltip = `${message}\nProvider: ${providerName()}\nModel: ${modelName()}\nClick to open the dashboard.`;
    renderDashboard();
  }

  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, trigger, token) {
      const settings = config();
      if (!settings.get<boolean>('enabled') || !settings.get<string[]>('languages')!.includes(document.languageId)) return [];
      if (cloud() && settings.get<boolean>('groqManualOnly') && trigger.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) return [];
      const text = document.getText();
      if (!text.trim() || token.isCancellationRequested) return [];
      const version = document.version;
      const requestId = ++latestRequest;
      const codeContext = { ...extractContext(text, document.offsetAt(position), settings.get<number>('contextCharacters')), language: document.languageId, fileName: document.fileName };
      if (!codeContext.prefix.trim()) return [];
      const outer = new AbortController();
      const subscription = token.onCancellationRequested(() => outer.abort());
      if (token.isCancellationRequested) outer.abort();
      const start = Date.now();
      try {
        const result = await coordinator.run(document.uri.toString(), trigger.triggerKind === vscode.InlineCompletionTriggerKind.Invoke ? 0 : settings.get<number>('debounceMs')!, settings.get<number>('timeoutMs')!, outer.signal, async signal => {
          if (requestId === latestRequest) update('Generating', `Generating with ${providerName()}. Keep typing to cancel.`);
          const transport = await getClient();
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          return transport.generate(codeContext, { model: modelName(), maxTokens: settings.get<number>(cloud() ? 'groqMaxTokens' : 'maxTokens')!, temperature: settings.get<number>('temperature')! }, signal);
        });
        if (token.isCancellationRequested || document.version !== version) return [];
        const insertion = sanitize(result.response, codeContext);
        lastMs = Date.now() - start;
        if (!insertion.trim()) { if (requestId === latestRequest) update('Ready', 'The model returned no new code. Try adding more context.'); return []; }
        received++;
        output.appendLine(`${new Date().toISOString()} | ${modelName()} | ${document.languageId} | ${lastMs} ms | ${insertion.length} chars | ${providerName()}`);
        if (requestId === latestRequest) update('Ready', `Suggestion ready in ${(lastMs / 1000).toFixed(2)}s. Tab to accept; Escape to dismiss.`);
        const item = new vscode.InlineCompletionItem(insertion, new vscode.Range(position, position));
        item.command = { command: 'vsHelper.accepted', title: 'Record accepted suggestion' };
        return [item];
      } catch (error) {
        if (outer.signal.aborted || (error as Error).name === 'AbortError') {
          if (requestId === latestRequest) update('Ready', 'Previous suggestion cancelled. Ready for your next edit.');
        } else {
          const message = error instanceof Error ? error.message : String(error);
          output.appendLine(`ERROR | ${message}`);
          if (requestId === latestRequest) update('Error', message);
        }
        return [];
      } finally { subscription.dispose(); }
    }
  };

  function register(name: string, action: () => unknown) { context.subscriptions.push(vscode.commands.registerCommand(`vsHelper.${name}`, action)); }
  register('accepted', () => { accepted++; renderDashboard(); });
  register('toggle', async () => { await config().update('enabled', !config().get('enabled'), target()); });
  register('trigger', async () => {
    if (!config().get('enabled')) { void vscode.window.showInformationMessage('VS_helper is disabled. Enable it from the dashboard.'); return; }
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });
  register('settings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:soorya-prataap-ray.vs-helper'));
  register('setGroqKey', async () => {
    const key = await vscode.window.showInputBox({ title: 'VS_helper — Groq API key', password: true, ignoreFocusOut: true, prompt: 'Stored in VS Code SecretStorage. Never saved to project files. Create a key at console.groq.com/keys.', placeHolder: 'Paste your Groq API key', validateInput: value => value.trim() && !/\s/.test(value.trim()) ? undefined : 'Enter a non-empty API key without spaces.' });
    if (key === undefined) return;
    await context.secrets.store('vsHelper.groqApiKey', key.trim());
    groqClient = undefined; health = 'Key saved — test connection';
    update('Ready', 'Groq API key saved securely. Select Groq as provider, then test the connection.');
  });
  register('removeGroqKey', async () => {
    coordinator.cancelAll(); await context.secrets.delete('vsHelper.groqApiKey'); groqClient = undefined; health = 'Key removed';
    update('Ready', 'Groq key removed. Cloud completion requires a new key.');
  });
  register('selectProvider', async () => {
    const selected = await vscode.window.showQuickPick([
      { label: 'Ollama — local', description: 'Runs on this computer; matches the reports', value: 'ollama' },
      { label: 'Groq — cloud demo', description: 'Sends code context to Groq; internet and API key required', value: 'groq' }
    ], { title: 'VS_helper — choose inference provider' });
    if (!selected) return;
    await config().update('provider', selected.value, target());
    if (selected.value === 'groq' && !await context.secrets.get('vsHelper.groqApiKey')) await vscode.commands.executeCommand('vsHelper.setGroqKey');
  });
  register('selectModel', async () => {
    try {
      const models = await (await getClient()).models(AbortSignal.timeout(15000));
      if (!models.length) { void vscode.window.showWarningMessage(cloud() ? 'No supported demo models returned by Groq. Check account model permissions.' : 'No local models installed. Run: ollama pull qwen2.5-coder:1.5b'); return; }
      const selected = await vscode.window.showQuickPick(models.map(model => ({ label: model.name, description: model.details?.parameter_size || '', detail: model.size ? `${(model.size / 1e9).toFixed(2)} GB on disk · local Ollama model` : undefined })), { title: `VS_helper — ${providerName()} models`, placeHolder: cloud() ? 'Groq cloud inference; account limits apply' : 'Source context stays on this computer' });
      if (selected) { await config().update(cloud() ? 'groqModel' : 'model', selected.label, target()); update('Ready', `Using ${selected.label}.`); }
    } catch (error) { update('Error', String(error)); void vscode.window.showErrorMessage(String(error)); }
  });
  register('testConnection', async () => {
    try {
      const models = await (await getClient()).models(AbortSignal.timeout(15000));
      const model = modelName();
      const found = models.some(item => item.name === model || item.name === `${model}:latest`);
      health = found ? 'Connected' : 'Model missing';
      const message = found ? `${providerName()} connected. ${model} is available. ${cloud() ? 'Cloud demo: code context is sent to Groq.' : `${models.length} model(s) installed locally.`}` : `${providerName()} connected, but ${model} is unavailable. Run VS_helper: Select Model.`;
      update(found ? 'Ready' : 'Error', message);
      if (found) void vscode.window.showInformationMessage(message); else void vscode.window.showWarningMessage(message);
    } catch (error) { health = 'Unavailable'; update('Error', String(error)); void vscode.window.showErrorMessage(String(error)); }
  });
  register('dashboard', () => {
    if (panel) { panel.reveal(); return; }
    panel = vscode.window.createWebviewPanel('vsHelperDashboard', 'VS_helper · Code AI', vscode.ViewColumn.Active, { enableScripts: true });
    panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
    panel.webview.onDidReceiveMessage(message => {
      if (['testConnection', 'selectModel', 'selectProvider', 'setGroqKey', 'removeGroqKey', 'toggle', 'settings', 'demo'].includes(message.command)) void vscode.commands.executeCommand(`vsHelper.${message.command}`);
      if (message.command === 'logs') output.show();
    }, undefined, context.subscriptions);
    renderDashboard();
  });
  register('demo', async () => { await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.joinPath(context.extensionUri, 'demo'), { forceNewWindow: true }); });
  context.subscriptions.push(status, output, coordinatorDisposable(coordinator), vscode.languages.registerInlineCompletionItemProvider([{ scheme: 'file' }, { scheme: 'untitled' }], provider),
    vscode.workspace.onDidChangeTextDocument(event => coordinator.cancel(event.document.uri.toString())),
    vscode.workspace.onDidCloseTextDocument(document => coordinator.cancel(document.uri.toString())),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('vsHelper')) { coordinator.cancelAll(); latestRequest++; client = undefined; groqClient = undefined; health = 'Not checked'; update('Ready', config().get('enabled') ? `${providerName()} completion is enabled.` : 'Completion is disabled.'); }
    })
  );
  update('Ready', detail);
  output.appendLine(`VS_helper activated. Provider: ${providerName()}. Ollama is loopback-only; optional Groq demo uses api.groq.com. Source text and API keys are not written to this log.`);
  return { provider, coordinator, getStats: () => ({ received, accepted, lastMs, state, provider: providerName() }) };
}

function coordinatorDisposable(coordinator: RequestCoordinator): vscode.Disposable { return new vscode.Disposable(() => coordinator.cancelAll()); }
export function deactivate() {}
