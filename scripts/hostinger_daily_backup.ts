/**
 * TURIHAMWE MANAGEMENT SYSTEM — NYAMUYANJA SACCO LTD
 * Hostinger Production Cron Backup Script
 * 
 * Scheduled Run Time: 00:00 midnight Africa/Kampala time (EAT, UTC+03:00)
 * Hostinger Crontab Entry (Server UTC):
 *   0 21 * * * cd /home/u123456789/turihamwe && npx tsx scripts/hostinger_daily_backup.ts >> /home/u123456789/turihamwe/logs/cron_backup.log 2>&1
 * 
 * Note: 21:00 UTC = 00:00 Africa/Kampala (UTC+3)
 */

import { serverStore } from '../src/server/storage/serverStore';
import { scheduledBackupWorker } from '../src/server/services/scheduledBackupWorker';
import { getUgandaDateString, formatUgandaDateTime } from '../src/utils/timezone';

async function runHostingerCronBackup() {
  console.log('================================================================');
  console.log('NYAMUYANJA SACCO LTD — TURIHAMWE CENTRAL BACKUP CRON');
  console.log(`Execution Time (EAT): ${formatUgandaDateTime(new Date())}`);
  console.log(`Target Calendar Date: ${getUgandaDateString()}`);
  console.log('================================================================');

  try {
    await serverStore.initialize();
    console.log('[CRON] Initialized central database storage engine.');

    const result = await scheduledBackupWorker.tick();
    console.log('[CRON] Scheduled backup execution result:', JSON.stringify(result, null, 2));

    if (result.status === 'SUCCESS' || result.status === 'ALREADY_COMPLETED_TODAY') {
      console.log(`[CRON] SUCCESS: Backup archive is verified and current (${result.filename || 'verified today'}).`);
      process.exit(0);
    } else {
      console.error('[CRON] FAILED: Backup did not complete successfully.');
      process.exit(1);
    }
  } catch (error) {
    console.error('[CRON] FATAL: Unhandled exception in Hostinger backup cron:', error);
    process.exit(1);
  }
}

runHostingerCronBackup();
