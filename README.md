# VS_helper

VS_helper is a VS Code extension for local code completion using Ollama.
It shows a suggestion as grey ghost text. Press Tab to accept or Escape to dismiss it.

Author: Soorya Prataap Ray, 24BAI1008, SCOPE, VIT Chennai.

## Main features

- Python, JavaScript, TypeScript, JSX and TSX support.
- Local Ollama model selection and connection testing.
- Cancellable requests, a typing debounce and bounded code context.
- Cleanup of repeated code, Markdown and output past an existing closing brace.
- A dashboard and an editor toolbar button for manual suggestions.
- Loopback-only Ollama endpoints with redirects blocked.

## Requirements

Install Node.js 22 or newer, VS Code and Ollama. The demo model is `qwen2.5-coder:1.5b`.
It runs on CPU. The model download needs internet access; local inference does not need a cloud API key.

## Run locally

```powershell
git clone https://github.com/Soorya-Ray/VS_helper.git
cd VS_helper
npm.cmd install
ollama pull qwen2.5-coder:1.5b
# Start Ollama if its app is not already running:
ollama serve
```

In another terminal, run:

```powershell
npm.cmd run package
code --install-extension .\vs-helper-0.3.1.vsix --force
code .\demo
```

The repository also includes a prebuilt VSIX. Reload VS Code after installing it.
Run **VS_helper: Select Provider**, choose **Ollama**, then run **VS_helper: Test Provider Connection**.
Open `demo/01_python.py` and place the cursor on the indented line below the function signature.
Click the sparkle icon in the editor toolbar, or press F1 and run **VS_helper: Trigger Inline Suggestion**.
Wait for grey code and press Tab. This avoids system-wide shortcut conflicts.
On Windows, `Start-Local-Demo.cmd` is an optional launcher.

## Environment and settings

No `.env` file or API key is required for Ollama mode.
The extension setting `vsHelper.endpoint` defaults to `http://127.0.0.1:11434`.
The setting `vsHelper.model` defaults to `qwen2.5-coder:1.5b`.
These optional environment variables apply to the Ollama server, not the extension:

```powershell
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
# Optional: choose your own model storage folder before starting Ollama.
# $env:OLLAMA_MODELS = 'C:\path\to\ollama-models'
ollama serve
```

Optional Groq cloud demo mode is separate from the local project workflow.
Choose Groq with **VS_helper: Select Provider** and enter your own key through
**VS_helper: Set Groq API Key**. The masked prompt stores it in VS Code SecretStorage.
Never put a real key in this repository. Groq sends code context to its cloud API,
so it does not demonstrate the local-only privacy design. The submitted demo uses Ollama.

## Tests

```powershell
npm.cmd test
npm.cmd run test:host
node scripts/verify-local.cjs
```

The unit suite has 43 passing tests. `test:host` uses mocked model responses.
`verify-local.cjs` requires the real model and checks three small functions.
To run the real editor test on Windows:

```powershell
$env:VS_HELPER_LIVE_TEST = '1'
npm.cmd run test:host
Remove-Item Env:VS_HELPER_LIVE_TEST
```

The recorded live editor run passed Python, JavaScript, TypeScript and native inline-trigger/commit checks.
Records are in `docs/local-verification.json` and `docs/live-extension-test.json`.
These are small functional checks, not proof that all generated code is correct.

## Project files

- `src/extension.ts`: editor integration, commands and dashboard.
- `src/core.ts`: context, prompts, sanitization and request cancellation.
- `src/ollama.ts`: local model discovery and generation.
- `src/groq.ts`: optional cloud demo adapter.
- `demo/`: short examples for recording.
- `docs/`: screenshot, validation evidence and presentation files.

This is a desktop extension, so a hosted live-app URL is not applicable.
The model weights, API keys, local runtime and dependency caches are not included.

## Presentation

The final presentation is in `docs/VSHelper_VS_helper_Presentation.pptx` and the matching PDF.
The demo video should be recorded with the student's own narration or photo and uploaded directly to Teams.
