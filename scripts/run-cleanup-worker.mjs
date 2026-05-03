#!/usr/bin/env node

/**
 * Background cleanup worker for VideoJam parties
 *
 * Run with: node scripts/run-cleanup-worker.mjs
 * Or use PM2: pm2 start scripts/run-cleanup-worker.mjs --name videojam-cleanup
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Setup environment
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Dynamic import of the cleanup worker (requires build output)
async function startWorker() {
  try {
    const { runPartyCleanup } = await import('../dist/lib/cleanup-worker.js');

    console.log('🎵 VideoJam Party Cleanup Worker');
    console.log('═════════════════════════════════');
    console.log('Starting background cleanup worker...');
    console.log('Checking every hour for inactive parties');
    console.log('Parties inactive for 6+ hours will be closed\n');

    let isRunning = false;

    // Schedule the cleanup to run every hour at the top of the hour
    const task = cron.schedule('0 * * * *', async () => {
      if (isRunning) {
        console.log(`[${new Date().toISOString()}] Cleanup already running, skipping...`);
        return;
      }

      isRunning = true;
      try {
        console.log(`[${new Date().toISOString()}] Starting cleanup check...`);
        const result = await runPartyCleanup();

        if (result.success) {
          console.log(
            `[${new Date().toISOString()}] ✓ Checked ${result.partiesChecked} parties, closed ${result.partiesClosed}`
          );
        } else {
          console.error(
            `[${new Date().toISOString()}] ✗ Cleanup failed (checked: ${result.partiesChecked}, closed: ${result.partiesClosed})`
          );
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error during cleanup:`, err);
      } finally {
        isRunning = false;
      }
    });

    console.log('✓ Worker started successfully\n');
    console.log('Press Ctrl+C to stop\n');

  } catch (err) {
    console.error('Failed to start cleanup worker:', err);
    console.error('\nMake sure to:');
    console.error('  1. npm install node-cron');
    console.error('  2. npm run build (to generate dist/lib/cleanup-worker.js)');
    process.exit(1);
  }
}

startWorker();
