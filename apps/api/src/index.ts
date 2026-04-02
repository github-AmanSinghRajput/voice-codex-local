import { closeDatabasePool } from './db/client.js';
import { env, validateEnv } from './config/env.js';
import { createApp } from './app/createApp.js';
import { logger } from './lib/logger.js';
import { resolveLocalApiAuthToken } from './lib/local-api-auth.js';

void bootstrap();

async function bootstrap() {
  validateEnv();
  const apiAuthToken = await resolveLocalApiAuthToken(env.localApiAuthToken);
  const {
    app,
    authService,
    userService,
    voiceSessionService,
    voiceTranscriptionService,
    workspaceService,
    ttsService
  } = createApp({ apiAuthToken });

  const server = app.listen(env.port, env.host, async () => {
    const operator = await userService.initializeLocalOperator();
    authService.setOperator(operator);
    await workspaceService.initialize();
    await voiceTranscriptionService.initialize();
    await ttsService.initialize();
    await voiceSessionService.refreshAudioState();
    logger.info('server.started', {
      port: env.port,
      host: env.host,
      appEnv: env.appEnv,
      url: `http://${env.host}:${env.port}`
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
}
