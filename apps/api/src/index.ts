import { closeDatabasePool } from './db/client.js';
import { env, validateEnv } from './config/env.js';
import { createApp } from './app/createApp.js';
import { logger } from './lib/logger.js';

validateEnv();
const {
  app,
  authService,
  userService,
  voiceSessionService,
  voiceTranscriptionService,
  workspaceService,
  ttsService
} = createApp();

const server = app.listen(env.port, async () => {
  const operator = await userService.initializeLocalOperator();
  authService.setOperator(operator);
  await workspaceService.initialize();
  await voiceTranscriptionService.initialize();
  await ttsService.initialize();
  await voiceSessionService.refreshAudioState();
  logger.info('server.started', {
    port: env.port,
    appEnv: env.appEnv,
    url: `http://localhost:${env.port}`
  });
});

async function shutdown() {
  server.close(async () => {
    await voiceTranscriptionService.shutdown();
    await ttsService.shutdown();
    await closeDatabasePool();
    logger.info('server.stopped');
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
