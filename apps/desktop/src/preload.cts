const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopShell', {
  platform: process.platform,
  isDesktop: true,
  apiBaseUrl: process.env.ELECTRON_API_BASE_URL ?? 'http://127.0.0.1:8787',
  apiAuthToken: process.env.LOCAL_API_AUTH_TOKEN ?? null,
  getRuntimeStatus: () => ipcRenderer.invoke('desktop:get-runtime-status'),
  pickProjectFolder: () => ipcRenderer.invoke('desktop:pick-project-folder'),
  subscribeRuntimeStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: unknown, status: unknown) => {
      callback(status);
    };

    ipcRenderer.on('desktop:runtime-status', listener);

    return () => {
      ipcRenderer.removeListener('desktop:runtime-status', listener);
    };
  },
  createPtySession: (config: { cwd?: string; cols?: number; rows?: number }) =>
    ipcRenderer.invoke('desktop:pty-create', config),
  writePty: (id: string, data: string) =>
    ipcRenderer.send('desktop:pty-write', { id, data }),
  resizePty: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('desktop:pty-resize', { id, cols, rows }),
  killPty: (id: string) => ipcRenderer.invoke('desktop:pty-kill', id),
  subscribePtyData: (callback: (payload: { id: string; data: string }) => void) => {
    const listener = (_event: unknown, payload: { id: string; data: string }) => {
      callback(payload);
    };

    ipcRenderer.on('desktop:pty-data', listener);

    return () => {
      ipcRenderer.removeListener('desktop:pty-data', listener);
    };
  },
  subscribePtyExit: (callback: (payload: { id: string; exitCode: number }) => void) => {
    const listener = (_event: unknown, payload: { id: string; exitCode: number }) => {
      callback(payload);
    };

    ipcRenderer.on('desktop:pty-exit', listener);

    return () => {
      ipcRenderer.removeListener('desktop:pty-exit', listener);
    };
  }
});
