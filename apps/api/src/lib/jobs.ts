import { logger } from './logger.js';

type JobWork<T> = () => Promise<T>;

export class InlineJobRunner {
  async run<T>(name: string, work: JobWork<T>) {
    const startedAt = Date.now();
    logger.info('job.started', { name });

    try {
      const result = await work();
      logger.info('job.completed', {
        name,
        durationMs: Date.now() - startedAt
      });
      return result;
    } catch (error) {
      logger.error('job.failed', {
        name,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Job execution failed.'
      });
      throw error;
    }
  }
}

export const jobRunner = new InlineJobRunner();
