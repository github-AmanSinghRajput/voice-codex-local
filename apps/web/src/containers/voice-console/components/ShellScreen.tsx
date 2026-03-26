import { useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';

interface ShellScreenProps {
  cwd: string | null;
}

export function ShellScreen({ cwd }: ShellScreenProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<unknown>(null);
  const fitAddonRef = useRef<unknown>(null);
  const ptyIdRef = useRef<string | null>(null);
  const fitTimerRef = useRef<number | null>(null);
  const initRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.desktopShell?.createPtySession) {
      setError('Terminal is only available in the desktop app.');
      return;
    }

    // Prevent double-init from React StrictMode
    if (initRef.current) {
      return;
    }
    initRef.current = true;

    let disposed = false;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

      if (disposed || !wrapperRef.current) {
        return;
      }

      const fitAddon = new FitAddon();
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
        theme: {
          background: '#0b0d11',
          foreground: '#e0e6ed',
          cursor: '#00e5ff',
          selectionBackground: '#1e3a5f',
          black: '#0b0d11',
          red: '#ff5c57',
          green: '#5af78e',
          yellow: '#f3f99d',
          blue: '#57c7ff',
          magenta: '#ff6ac1',
          cyan: '#9aedfe',
          white: '#f1f1f0',
          brightBlack: '#686868',
          brightRed: '#ff5c57',
          brightGreen: '#5af78e',
          brightYellow: '#f3f99d',
          brightBlue: '#57c7ff',
          brightMagenta: '#ff6ac1',
          brightCyan: '#9aedfe',
          brightWhite: '#f1f1f0'
        },
        allowProposedApi: true
      });

      terminal.loadAddon(fitAddon);
      terminal.open(wrapperRef.current);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Wait for layout to settle so fit() gets real dimensions
      await new Promise((r) => setTimeout(r, 100));
      if (disposed) { return; }
      fitAddon.fit();

      // Ensure sensible minimums — xterm can report rows:1 if container isn't fully laid out
      const cols = Math.max(terminal.cols, 80);
      const rows = Math.max(terminal.rows, 20);

      let ptyId: string;
      try {
        ptyId = await window.desktopShell!.createPtySession({
          cwd: cwd ?? undefined,
          cols,
          rows
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        terminal.writeln(`\r\n\x1b[31mFailed to start shell: ${msg}\x1b[0m`);
        terminal.writeln('\r\nThe integrated terminal requires the desktop runtime.');
        setError(msg);
        return;
      }

      if (disposed) {
        void window.desktopShell!.killPty(ptyId);
        terminal.dispose();
        return;
      }

      ptyIdRef.current = ptyId;

      terminal.onData((data: string) => {
        window.desktopShell?.writePty(ptyId, data);
      });

      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        window.desktopShell?.resizePty(ptyId, cols, rows);
      });

      unsubData = window.desktopShell!.subscribePtyData((payload) => {
        if (payload.id === ptyId) {
          terminal.write(payload.data);
        }
      });

      unsubExit = window.desktopShell!.subscribePtyExit((payload) => {
        if (payload.id === ptyId) {
          terminal.writeln(`\r\n[Process exited with code ${payload.exitCode}]`);
          ptyIdRef.current = null;
        }
      });

      setReady(true);
    }

    void init().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to initialize terminal.');
    });

    // Debounced resize — observe the parent screen element, not the xterm container
    const screenEl = wrapperRef.current?.closest('.shell-screen');
    const resizeObserver = new ResizeObserver(() => {
      if (fitTimerRef.current !== null) {
        window.clearTimeout(fitTimerRef.current);
      }

      fitTimerRef.current = window.setTimeout(() => {
        fitTimerRef.current = null;
        const fit = fitAddonRef.current as { fit?: () => void } | null;
        if (fit?.fit) {
          try { fit.fit(); } catch { /* ignore fit errors */ }
        }
      }, 150);
    });

    if (screenEl) {
      resizeObserver.observe(screenEl);
    }

    return () => {
      disposed = true;
      initRef.current = false;

      if (fitTimerRef.current !== null) {
        window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
      }

      resizeObserver.disconnect();
      unsubData?.();
      unsubExit?.();

      if (ptyIdRef.current) {
        void window.desktopShell?.killPty(ptyIdRef.current);
        ptyIdRef.current = null;
      }

      const terminal = terminalRef.current as { dispose?: () => void } | null;
      if (terminal?.dispose) {
        terminal.dispose();
      }

      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  if (error && !terminalRef.current) {
    return (
      <section className="screen shell-screen">
        <div className="section-head">
          <div>
            <p className="section-kicker">Shell</p>
            <h2>Integrated terminal</h2>
          </div>
          <span className="section-chip rejected">Error</span>
        </div>
        <div className="terminal-card">
          <div className="empty-state">
            <p>{error}</p>
            <span>Check the desktop console logs for details.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen shell-screen">
      <div className="section-head">
        <div>
          <p className="section-kicker">Shell</p>
          <h2>{cwd ?? 'No project selected'}</h2>
        </div>
        {ready ? <span className="section-chip approved">Connected</span> : <span className="section-chip pending">Starting...</span>}
      </div>
      <div className="shell-terminal-wrapper" ref={wrapperRef} />
    </section>
  );
}
