type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, event: string, context: Record<string, unknown> = {}) {
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...context
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(event: string, context?: Record<string, unknown>) {
    write('info', event, context);
  },
  warn(event: string, context?: Record<string, unknown>) {
    write('warn', event, context);
  },
  error(event: string, context?: Record<string, unknown>) {
    write('error', event, context);
  }
};
