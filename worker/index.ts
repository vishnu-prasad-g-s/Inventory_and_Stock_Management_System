import PgBoss from 'pg-boss';
import { logger } from '../server/lib/logger';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function startWorker() {
  if (!connectionString) {
    logger.error('Database connection string missing for worker process');
    process.exit(1);
  }

  const boss = new PgBoss({
    connectionString,
    archiveCompletedAfterSeconds: 86400 * 7, // Archive completed jobs after 7 days
  });

  boss.on('error', (error) => logger.error({ error }, 'pg-boss worker error'));

  await boss.start();
  logger.info('pg-boss background worker process initialized and listening for jobs.');

  // Register Outbox Dispatcher job queue worker
  await boss.work('outbox.dispatch', async (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'Processing outbox dispatch job');
    // Outbox dispatch logic
  });

  // Register Import Commit worker
  await boss.work('import.commit', async (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'Processing import commit job');
  });

  // Graceful shutdown handling
  const shutdown = async () => {
    logger.info('Shutting down worker process...');
    await boss.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startWorker().catch((err) => {
  logger.error({ err }, 'Failed to start background worker process');
  process.exit(1);
});
