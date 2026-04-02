import path from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { accessSync, constants as fsConstants, realpathSync, statSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  session,
  type OpenDialogOptions
} from 'electron';
import * as pty from 'node-pty';
import { resolveLocalApiAuthToken } from './local-api-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevelopment = !app.isPackaged;
const apiBaseUrl = process.env.ELECTRON_API_BASE_URL ?? 'http://127.0.0.1:8787';
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173';
const trustedDevOrigin = new URL(rendererUrl).origin;
const packagedRendererUrl = pathToFileURL(path.join(__dirname, '../../web/dist/index.html')).toString();
const openDevTools = process.env.ELECTRON_OPEN_DEVTOOLS === 'true';

type ApiOwner = 'electron' | 'external' | 'none';
type ApiPhase = 'idle' | 'starting' | 'running' | 'failed' | 'stopped';

interface DesktopRuntimeStatus {
  isDesktop: true;
  isDevelopment: boolean;
  apiBaseUrl: string;
  apiOwner: ApiOwner;
  apiPhase: ApiPhase;
  apiReachable: boolean;
  apiPid: number | null;
  apiError: string | null;
}

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;
let apiProcessOwnedByElectron = false;
let runtimeStatus: DesktopRuntimeStatus = {
  isDesktop: true,
  isDevelopment,
  apiBaseUrl,
  apiOwner: 'none',
  apiPhase: 'idle',
  apiReachable: false,
  apiPid: null,
  apiError: null
};

const ptyProcesses = new Map<string, pty.IPty>();
let ptyIdCounter = 0;

function isTrustedRendererUrl(url: string) {
  if (!url) {
    return false;
  }

  if (isDevelopment) {
    return url.startsWith(trustedDevOrigin);
  }

  return url === packagedRendererUrl;
}

function assertTrustedSender(senderUrl: string) {
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Untrusted renderer origin.');
  }
}

function getSenderUrl(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  return event.senderFrame?.url ?? event.sender.getURL();
}

function isTrustedMediaOrigin(originOrUrl: string) {
  if (!originOrUrl) {
    return false;
  }

  if (isDevelopment) {
    return originOrUrl.startsWith(trustedDevOrigin);
  }

  return originOrUrl.startsWith('file://');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0b0d11',
    title: 'VOCOD',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(1);
  });

  if (isDevelopment) {
    void mainWindow.loadURL(rendererUrl);
    if (openDevTools) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    return;
  }

  void mainWindow.loadFile(path.join(__dirname, '../../web/dist/index.html'));
}

async function isApiReachable() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/health/live`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApiHealthy(timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isApiReachable()) {
      return true;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  return false;
}

async function getRuntimeStatus() {
  const reachable = await isApiReachable();

  runtimeStatus = {
    ...runtimeStatus,
    apiReachable: reachable,
    apiPhase: reachable
      ? 'running'
      : apiProcessOwnedByElectron && apiProcess
        ? runtimeStatus.apiPhase
        : runtimeStatus.apiPhase === 'failed'
          ? 'failed'
          : 'stopped'
  };

  return runtimeStatus;
}

function publishRuntimeStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('desktop:runtime-status', runtimeStatus);
}

function setRuntimeStatus(patch: Partial<DesktopRuntimeStatus>) {
  runtimeStatus = {
    ...runtimeStatus,
    ...patch
  };
  publishRuntimeStatus();
}

async function ensureLocalApi() {
  if (await isApiReachable()) {
    setRuntimeStatus({
      apiOwner: 'external',
      apiPhase: 'running',
      apiReachable: true,
      apiPid: null,
      apiError: null
    });
    return;
  }

  if (!isDevelopment) {
    setRuntimeStatus({
      apiOwner: 'none',
      apiPhase: 'failed',
      apiReachable: false,
      apiPid: null,
      apiError: 'Packaged desktop runtime startup is not wired yet.'
    });
    return;
  }

  setRuntimeStatus({
    apiOwner: 'electron',
    apiPhase: 'starting',
    apiReachable: false,
    apiPid: null,
    apiError: null
  });

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  apiProcess = spawn(npmCommand, ['run', 'dev', '--workspace', '@voice-codex/api'], {
    cwd: path.join(__dirname, '../../..'),
    stdio: 'ignore',
    env: {
      ...process.env,
      API_HOST: '127.0.0.1',
      LOCAL_API_AUTH_TOKEN: process.env.LOCAL_API_AUTH_TOKEN ?? ''
    }
  });
  apiProcessOwnedByElectron = true;

  setRuntimeStatus({
    apiPid: apiProcess.pid ?? null
  });

  apiProcess.once('exit', (code, signal) => {
    apiProcess = null;
    const exitedCleanly = code === 0 || signal === 'SIGTERM';

    setRuntimeStatus({
      apiOwner: 'none',
      apiPhase: exitedCleanly ? 'stopped' : 'failed',
      apiReachable: false,
      apiPid: null,
      apiError: exitedCleanly ? null : `Local API exited unexpectedly (${code ?? signal ?? 'unknown'}).`
    });
  });

  const ready = await waitForApiHealthy(15_000);
  if (!ready) {
    setRuntimeStatus({
      apiPhase: 'failed',
      apiReachable: false,
      apiError: 'Local API did not become healthy in time.'
    });
    return;
  }

  setRuntimeStatus({
    apiPhase: 'running',
    apiReachable: true,
    apiError: null
  });
}

function stopLocalApi() {
  if (apiProcessOwnedByElectron && apiProcess && !apiProcess.killed) {
    apiProcess.kill('SIGTERM');
  }
}

function resolveShellPath(): string {
  const envShell = process.env.SHELL;
  if (envShell) {
    try {
      accessSync(envShell, fsConstants.X_OK);
      return envShell;
    } catch {
      // fall through
    }
  }

  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return '/bin/sh';
}

function ensurePtySpawnHelper() {
  const nodePtyDir = path.resolve(__dirname, '../../../node_modules/node-pty');
  const helperPath = path.join(nodePtyDir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
  try {
    const { statSync, chmodSync } = require('node:fs');
    const stat = statSync(helperPath);
    if (!(stat.mode & 0o111)) {
      chmodSync(helperPath, stat.mode | 0o755);
      console.log(`[pty] fixed spawn-helper permissions: ${helperPath}`);
    }
  } catch {
    // prebuild may not exist if compiled from source
  }
}

function resolveValidatedPtyCwd(inputCwd?: string) {
  const homeDir = realpathSync(process.env.HOME ?? '/');
  const resolvedCwd = path.resolve(inputCwd ?? homeDir);
  const realCwd = realpathSync(resolvedCwd);
  const relativeToHome = path.relative(homeDir, realCwd);

  if (relativeToHome === '..' || relativeToHome.startsWith(`..${path.sep}`)) {
    throw new Error('Terminal session cwd must stay inside your home directory.');
  }

  if (!statSync(realCwd).isDirectory()) {
    throw new Error('Terminal session cwd must be a directory.');
  }

  return realCwd;
}

function normalizePtySize(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value!)));
}

function createPtySession(config: { cwd?: string; cols?: number; rows?: number }): string {
  const id = `pty-${++ptyIdCounter}`;
  ensurePtySpawnHelper();
  const shellPath = resolveShellPath();
  const resolvedCwd = resolveValidatedPtyCwd(config.cwd);

  const term = pty.spawn(shellPath, ['-l'], {
    name: 'xterm-256color',
    cols: normalizePtySize(config.cols, 120, 48, 220),
    rows: normalizePtySize(config.rows, 30, 12, 80),
    cwd: resolvedCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      SHELL: shellPath,
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } as Record<string, string>
  });

  ptyProcesses.set(id, term);

  term.onData((data) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send('desktop:pty-data', { id, data });
  });

  term.onExit(({ exitCode }) => {
    ptyProcesses.delete(id);
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send('desktop:pty-exit', { id, exitCode });
  });

  return id;
}

function writePty(id: string, data: string) {
  const term = ptyProcesses.get(id);
  if (term) {
    term.write(data);
  }
}

function resizePty(id: string, cols: number, rows: number) {
  const term = ptyProcesses.get(id);
  if (term) {
    term.resize(cols, rows);
  }
}

function killPty(id: string) {
  const term = ptyProcesses.get(id);
  if (term) {
    term.kill();
    ptyProcesses.delete(id);
  }
}

function killAllPtySessions() {
  for (const [id, term] of ptyProcesses) {
    term.kill();
    ptyProcesses.delete(id);
  }
}

app.whenReady().then(async () => {
  process.env.LOCAL_API_AUTH_TOKEN = await resolveLocalApiAuthToken(process.env.LOCAL_API_AUTH_TOKEN);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (
      permission === 'media' &&
      isTrustedMediaOrigin(webContents.getURL())
    ) {
      callback(true);
      return;
    }

    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (
      permission === 'media' &&
      isTrustedMediaOrigin(requestingOrigin)
    ) {
      return true;
    }

    return false;
  });

  ipcMain.handle('desktop:get-runtime-status', async (event) => {
    assertTrustedSender(getSenderUrl(event));
    return getRuntimeStatus();
  });
  ipcMain.handle('desktop:pick-project-folder', async (event) => {
    assertTrustedSender(getSenderUrl(event));
    const targetWindow = mainWindow ?? BrowserWindow.getFocusedWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Choose project folder',
      properties: ['openDirectory']
    };
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
  ipcMain.handle(
    'desktop:pty-create',
    (event, config: { cwd?: string; cols?: number; rows?: number }) => {
      assertTrustedSender(getSenderUrl(event));
      try {
        return createPtySession(config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[pty] failed to create session: ${msg}`);
        throw new Error(`Terminal session failed: ${msg}`);
      }
    }
  );
  ipcMain.on(
    'desktop:pty-write',
    (event, payload: { id: string; data: string }) => {
      assertTrustedSender(getSenderUrl(event));
      if (typeof payload?.id !== 'string' || typeof payload?.data !== 'string') {
        return;
      }
      writePty(payload.id, payload.data.slice(0, 8192));
    }
  );
  ipcMain.on(
    'desktop:pty-resize',
    (event, payload: { id: string; cols: number; rows: number }) => {
      assertTrustedSender(getSenderUrl(event));
      if (typeof payload?.id !== 'string') {
        return;
      }
      resizePty(
        payload.id,
        normalizePtySize(payload.cols, 120, 48, 220),
        normalizePtySize(payload.rows, 30, 12, 80)
      );
    }
  );
  ipcMain.handle('desktop:pty-kill', (event, id: string) => {
    assertTrustedSender(getSenderUrl(event));
    killPty(id);
    return true;
  });

  void ensureLocalApi().finally(() => {
    createWindow();
    publishRuntimeStatus();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      publishRuntimeStatus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killAllPtySessions();
  stopLocalApi();
});
