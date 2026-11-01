const path = require('node:path');
const { spawn } = require('node:child_process');
const executable = process.env.VSCODE_EXECUTABLE || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [
  `--extensionDevelopmentPath=${path.resolve(__dirname, '..')}`,
  `--extensionTestsPath=${path.resolve(__dirname, process.env.VS_HELPER_LIVE_TEST ? '../test/live-host.cjs' : '../test/host.cjs')}`,
  '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
  `--user-data-dir=${path.resolve(__dirname, '../.vscode-test/isolated-user-data')}`
], { env, stdio: 'inherit', shell: false });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
