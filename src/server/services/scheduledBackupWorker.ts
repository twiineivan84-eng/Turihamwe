import { serverStore } from '../storage/serverStore';
import { AuditService } from './auditService';
import { ScheduledBackupStatus, SystemAlert } from '../../types';
import { config } from '../config';
import {
  getUgandaDateString,
  getUgandaDateTimeParts,
  formatUgandaDateTime,
  UGANDA_TIMEZONE,
} from '../../utils/timezone';

export class ScheduledBackupWorker {
  private static instance: ScheduledBackupWorker;
  private workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isRunningState = false;
  private intervalMs = 60000; // Check every 60 seconds
  private lastRunTime?: string;
  private lastRunDateUganda?: string;
  private lastStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'IDLE' = 'IDLE';
  private lastBackupFilename?: string;
  private lastBackupChecksum?: string;

  private constructor() {
    this.workerId = `worker-backup-${process.pid}-${Math.random().toString(36).substring(2, 6)}`;
  }

  public static getInstance(): ScheduledBackupWorker {
    if (!ScheduledBackupWorker.instance) {
      ScheduledBackupWorker.instance = new ScheduledBackupWorker();
    }
    return ScheduledBackupWorker.instance;
  }

  /**
   * Start the background automated midnight backup worker.
   * Runs daily at 00:00 midnight Africa/Kampala (UTC+03:00).
   */
  public start(): void {
    if (this.isRunningState) return;

    this.isRunningState = true;
    console.log(
      `[BACKUP DAEMON] Automated Midnight Backup Worker started (ID: ${this.workerId}, Schedule: 00:00 Africa/Kampala)`
    );

    // Initial check on server boot/restart: ensure today's backup is not missed
    this.tick().catch(err => {
      console.error('[BACKUP DAEMON] Error during initial startup check:', err);
    });

    // Schedule regular polling every 60 seconds
    this.timer = setInterval(() => {
      this.tick().catch(err => {
        console.error('[BACKUP DAEMON] Error during periodic tick:', err);
      });
    }, this.intervalMs);
  }

  /**
   * Stop background backup worker.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunningState = false;
    console.log('[BACKUP DAEMON] Automated Midnight Backup Worker stopped.');
  }

  public isRunning(): boolean {
    return this.isRunningState;
  }

  /**
   * Calculates the ISO string for next 00:00 midnight in Africa/Kampala.
   */
  public calculateNextScheduledTimeUganda(): string {
    const now = new Date();
    const parts = getUgandaDateTimeParts(now);
    // Construct tomorrow's date at 00:00:00 EAT (which is 21:00 UTC previous day)
    // EAT is UTC+3, so 00:00 EAT on day D+1 is 21:00 UTC on day D.
    const todayUganda = getUgandaDateString(now);
    const [y, m, d] = todayUganda.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 21, 0, 0)); // 21:00 UTC = 00:00 EAT next day
    if (dateObj.getTime() <= now.getTime()) {
      dateObj.setUTCDate(dateObj.getUTCDate() + 1);
    }
    return dateObj.toISOString();
  }

  /**
   * Worker tick: Evaluates whether an automated daily backup should be triggered.
   * Target: 00:00 midnight Africa/Kampala time.
   */
  public async tick(): Promise<{ executed: boolean; status: string; filename?: string; error?: string }> {
    if (this.isProcessing) {
      return { executed: false, status: 'BUSY' };
    }

    const cfg = serverStore.getBackupConfig();
    if (!cfg.scheduledBackupsEnabled) {
      return { executed: false, status: 'DISABLED' };
    }

    const now = new Date();
    const ugandaDate = getUgandaDateString(now);
    const ugandaParts = getUgandaDateTimeParts(now);

    // Check if an automated backup has already been completed today in Uganda
    const backups = serverStore.getBackups();
    const completedToday = backups.find(
      b => b.type === 'SCHEDULED' && b.filename.includes(ugandaDate) && (b.status === 'VERIFIED' || b.status === 'COMPLETED')
    );

    if (completedToday) {
      this.lastStatus = 'SUCCESS';
      this.lastRunDateUganda = ugandaDate;
      this.lastBackupFilename = completedToday.filename;
      this.lastBackupChecksum = completedToday.checksum;
      return { executed: false, status: 'ALREADY_COMPLETED_TODAY', filename: completedToday.filename };
    }

    // Trigger window: When hour is 0 (between 00:00 and 00:59 EAT) OR if today has no backup yet
    // If midnight has arrived or passed for todayUganda, trigger the automated backup
    const isMidnightHour = ugandaParts.hour === 0;

    // Trigger if it's the midnight window (or catch up if server was down at midnight)
    this.isProcessing = true;
    try {
      console.log(`[BACKUP DAEMON] Executing automated daily backup for ${ugandaDate} (00:00 Africa/Kampala schedule)...`);
      const result = serverStore.createAutomaticBackup();

      if (result.success && result.backup) {
        this.lastRunTime = new Date().toISOString();
        this.lastRunDateUganda = ugandaDate;
        this.lastStatus = 'SUCCESS';
        this.lastBackupFilename = result.backup.filename;
        this.lastBackupChecksum = result.backup.checksum;

        AuditService.log({
          userId: 'system',
          username: 'BACKUP_DAEMON',
          userFullName: 'Automated Midnight Backup Worker',
          branchId: 'br-nyamuyanja',
          branchName: 'Nyamuyanja Branch (Headquarters)',
          action: 'BACKUP_CREATED',
          recordType: 'BACKUP',
          recordId: result.backup.id,
          newValue: `Automated daily midnight backup created: ${result.backup.filename} (${(result.backup.sizeBytes / 1024).toFixed(1)} KB, SHA-256: ${result.backup.checksum.slice(0, 16)}...)`,
          reason: `Automated 00:00 midnight Africa/Kampala institutional backup for ${ugandaDate}`,
        });

        console.log(`[BACKUP DAEMON] Automated backup created successfully: ${result.backup.filename}`);
        return { executed: true, status: 'SUCCESS', filename: result.backup.filename };
      } else {
        throw new Error(result.message || 'Backup generation returned non-success result.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error during backup';
      this.lastStatus = 'FAILED';
      console.error('[BACKUP DAEMON] Automated midnight backup FAILED:', errMsg);

      // Alert IT Officer on failure
      const alert: SystemAlert = {
        id: `alt-bkp-fail-${Date.now()}`,
        category: 'SYSTEM_EVENT',
        severity: 'CRITICAL',
        title: 'Automated Midnight Backup Failed',
        message: `Automated daily backup for ${ugandaDate} failed to complete: ${errMsg}. Please inspect disk storage and trigger a manual backup immediately.`,
        branchId: 'br-nyamuyanja',
        branchName: 'Nyamuyanja Branch (Headquarters)',
        linkTab: 'system',
        recordId: `FAILED_${ugandaDate}`,
        requiredPermission: 'audit.manage_backups',
        status: 'UNREAD',
        readByUsers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      serverStore.addAlert(alert);

      AuditService.log({
        userId: 'system',
        username: 'BACKUP_DAEMON',
        userFullName: 'Automated Midnight Backup Worker',
        branchId: 'br-nyamuyanja',
        branchName: 'Nyamuyanja Branch (Headquarters)',
        action: 'SYSTEM_ERROR_LOGGED',
        recordType: 'BACKUP_FAILURE',
        recordId: `FAILED_${ugandaDate}`,
        newValue: `Automated midnight backup failed: ${errMsg}`,
        reason: 'Automated daily backup execution error',
      });

      return { executed: false, status: 'FAILED', error: errMsg };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manual invocation of the automated daily backup process by administrator.
   */
  public async triggerNow(operator?: { userId: string; username: string; userFullName: string }): Promise<{
    success: boolean;
    message: string;
    backup?: any;
  }> {
    const result = serverStore.createAutomaticBackup({ force: true });
    if (result.success && result.backup) {
      this.lastRunTime = new Date().toISOString();
      this.lastRunDateUganda = getUgandaDateString();
      this.lastStatus = 'SUCCESS';
      this.lastBackupFilename = result.backup.filename;
      this.lastBackupChecksum = result.backup.checksum;

      if (operator) {
        AuditService.log({
          userId: operator.userId,
          username: operator.username,
          userFullName: operator.userFullName,
          branchId: 'br-nyamuyanja',
          branchName: 'Nyamuyanja Branch (Headquarters)',
          action: 'BACKUP_CREATED',
          recordType: 'BACKUP',
          recordId: result.backup.id,
          newValue: `Manual trigger of automated backup pipeline: ${result.backup.filename}`,
          reason: 'Authorized administrator triggered immediate automated backup snapshot',
        });
      }
    }
    return result;
  }

  /**
   * Returns complete diagnostics and status of the automated midnight backup worker.
   */
  public getStatus(): ScheduledBackupStatus {
    const cfg = serverStore.getBackupConfig();
    return {
      scheduledBackupsEnabled: cfg.scheduledBackupsEnabled,
      frequency: cfg.backupFrequency || 'DAILY',
      scheduleTimeKampala: '00:00 (Midnight EAT / UTC+03:00)',
      timezone: UGANDA_TIMEZONE,
      workerRunning: this.isRunningState,
      lastRunTime: this.lastRunTime || cfg.lastBackupAt,
      lastRunDateUganda: this.lastRunDateUganda || (cfg.lastBackupAt ? getUgandaDateString(cfg.lastBackupAt) : undefined),
      lastStatus: this.lastStatus,
      lastBackupFilename: this.lastBackupFilename,
      lastBackupChecksum: this.lastBackupChecksum,
      nextScheduledTimeUganda: this.calculateNextScheduledTimeUganda(),
      dailyDeduplicationKey: this.lastRunDateUganda ? `DAILY_AUTO_BACKUP_${this.lastRunDateUganda}` : undefined,
      storagePath: config.backup.storagePath,
      fileFormat: '.bak (Cryptographically Verified JSON Archive)',
    };
  }
}

export const scheduledBackupWorker = ScheduledBackupWorker.getInstance();
