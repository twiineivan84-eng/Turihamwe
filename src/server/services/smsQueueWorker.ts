import { serverStore } from '../storage/serverStore';
import { PandoraAdapter } from './pandoraAdapter';
import { AuditService } from './auditService';
import { SmsWorkerStatus, SmsProviderDiagnostics } from '../../types';
import { config } from '../config';

export class SmsQueueWorker {
  private static instance: SmsQueueWorker;
  private workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private status: SmsWorkerStatus = 'STOPPED';
  private intervalMs = 15000; // 15 seconds poll interval

  private constructor() {
    this.workerId = `worker-sms-${process.pid}-${Math.random().toString(36).substring(2, 6)}`;
  }

  public static getInstance(): SmsQueueWorker {
    if (!SmsQueueWorker.instance) {
      SmsQueueWorker.instance = new SmsQueueWorker();
    }
    return SmsQueueWorker.instance;
  }

  /**
   * Start the background queue worker and automated plan expiry scheduler.
   */
  public start(): void {
    if (this.status === 'RUNNING') return;

    this.status = 'RUNNING';
    console.log(`[SMS WORKER] Background SMS Queue Worker starting with ID: ${this.workerId} (exclusive provider: PANDORA, interval: ${this.intervalMs / 1000}s)`);

    // Run tick immediately on start
    this.tick().catch(err => {
      console.error('[SMS WORKER] Error during initial tick:', err);
    });

    // Schedule regular polling
    this.timer = setInterval(() => {
      this.tick().catch(err => {
        console.error('[SMS WORKER] Error during polling tick:', err);
      });
    }, this.intervalMs);
  }

  /**
   * Stop or pause the background queue worker.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'STOPPED';
    console.log('[SMS WORKER] Background SMS Queue Worker stopped.');
  }

  public getStatus(): SmsWorkerStatus {
    return this.status;
  }

  public getIntervalSeconds(): number {
    return this.intervalMs / 1000;
  }

  public setIntervalSeconds(seconds: number): void {
    const sec = Math.max(5, Math.min(300, seconds));
    this.intervalMs = sec * 1000;
    if (this.status === 'RUNNING') {
      this.stop();
      this.start();
    }
  }

  /**
   * Single execution tick:
   * 1. Evaluates automated plan expiry notification events (Phase 4).
   * 2. Checks Pandora configuration.
   * 3. Claims pending messages atomically and dispatches through Pandora Networks.
   */
  public async tick(): Promise<{ claimed: number; sent: number; retried: number; failed: number }> {
    if (this.isProcessing) {
      return { claimed: 0, sent: 0, retried: 0, failed: 0 };
    }

    this.isProcessing = true;

    try {
      // Step 1: Automated Expiry Scheduling Evaluation
      try {
        const { SmsService } = await import('./smsService');
        SmsService.evaluateExpiryNotificationEvents();
      } catch (schedErr) {
        console.error('[SMS WORKER] Error evaluating automated expiry notifications:', schedErr);
      }

      // Step 2: Validate Pandora Provider Configuration
      const validation = PandoraAdapter.validateConfiguration();

      if (!validation.canSubmit) {
        // Provider is not configured or disabled.
        // As required: queued messages stay in the queue and are never marked as sent.
        serverStore.recordSmsTelemetry({
          lastErrorSanitized: validation.message,
          lastErrorTime: new Date().toISOString(),
        });
        return { claimed: 0, sent: 0, retried: 0, failed: 0 };
      }

      if (this.status !== 'RUNNING') {
        this.isProcessing = false;
        return { claimed: 0, sent: 0, retried: 0, failed: 0 };
      }

      // Claim up to 15 pending messages atomically
      const claimedMessages = serverStore.claimPendingSms(this.workerId, 15);
      if (claimedMessages.length === 0) {
        return { claimed: 0, sent: 0, retried: 0, failed: 0 };
      }

      const nowIso = new Date().toISOString();
      serverStore.recordSmsTelemetry({ lastSubmissionTime: nowIso });

      let sent = 0;
      let retried = 0;
      let failed = 0;

      for (const msg of claimedMessages) {
        if (this.status !== 'RUNNING') {
          msg.status = 'PENDING';
          msg.lockedAt = undefined;
          msg.lockedBy = undefined;
          serverStore.updateSmsMessage(msg);
          break;
        }
        try {
          msg.provider = 'PANDORA';

          const submission = await PandoraAdapter.submitMessage({
            to: msg.recipientPhone,
            messageText: msg.messageText,
            senderId: config.sms.pandora.senderId,
          });

          if (submission.success) {
            msg.status = 'SENT';
            msg.sentAt = new Date().toISOString();
            msg.providerMessageId = submission.providerMessageId;
            msg.providerCostUGX = submission.costUGX || 30.0;
            msg.deliveryStatus = submission.deliveryStatus || 'Submitted';
            msg.deliveryConfirmed = false;
            msg.failureReason = undefined;
            msg.lockedAt = undefined;
            msg.lockedBy = undefined;
            msg.nextRetryAt = undefined;
            msg.updatedAt = new Date().toISOString();
            serverStore.updateSmsMessage(msg);

            serverStore.recordSmsTelemetry({
              lastSuccessTime: new Date().toISOString(),
              lastSubmissionTime: new Date().toISOString(),
            });

            AuditService.log({
              userId: 'system',
              username: 'PANDORA_WORKER',
              userFullName: 'Pandora Background Queue Worker',
              branchId: msg.branchId,
              branchName: msg.branchName,
              action: 'SMS_SENT',
              recordType: 'SMS',
              recordId: msg.id,
              newValue: JSON.stringify({
                providerMessageId: msg.providerMessageId,
                costUGX: msg.providerCostUGX,
                recipientPhone: msg.recipientPhone,
                deliveryStatus: msg.deliveryStatus,
                deliveryConfirmed: false,
                provider: 'PANDORA',
              }),
              reason: 'SMS submitted to Pandora Networks telecommunications gateway in Uganda',
            });

            sent++;
          } else {
            const errorReason = submission.error || 'Submission failed';
            const willRetry = submission.isTransientFailure && (msg.retryCount + 1 < msg.maxRetries);

            if (willRetry) {
              msg.retryCount += 1;
              msg.status = 'PENDING';
              msg.failureReason = `Retry ${msg.retryCount}/${msg.maxRetries}: ${errorReason}`;
              // Exponential backoff: 30s, 60s, 120s
              const backoffMs = Math.min(30000 * Math.pow(2, msg.retryCount - 1), 300000);
              msg.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
              msg.lockedAt = undefined;
              msg.lockedBy = undefined;
              msg.updatedAt = new Date().toISOString();
              serverStore.updateSmsMessage(msg);

              AuditService.log({
                userId: 'system',
                username: 'PANDORA_WORKER',
                userFullName: 'Pandora Background Queue Worker',
                branchId: msg.branchId,
                branchName: msg.branchName,
                action: 'SMS_RETRIED',
                recordType: 'SMS',
                recordId: msg.id,
                newValue: JSON.stringify({
                  retryCount: msg.retryCount,
                  nextRetryAt: msg.nextRetryAt,
                  error: errorReason,
                  provider: 'PANDORA',
                }),
                reason: `Transient error encountered; scheduled retry ${msg.retryCount} of ${msg.maxRetries}`,
              });

              retried++;
            } else {
              // Final permanent failure
              msg.status = 'FAILED';
              msg.failedAt = new Date().toISOString();
              msg.failureReason = errorReason;
              msg.retryCount += 1;
              msg.lockedAt = undefined;
              msg.lockedBy = undefined;
              msg.nextRetryAt = undefined;
              msg.updatedAt = new Date().toISOString();
              serverStore.updateSmsMessage(msg);

              // Create alert for staff
              serverStore.addAlert({
                id: `alt-sms-worker-${Date.now()}`,
                category: 'SMS_FAILURE',
                severity: 'WARNING',
                title: `SMS Dispatch Failed to ${msg.recipientName}`,
                message: `Failed to deliver notification to ${msg.recipientPhone}: ${errorReason}. Check SMS Queue in System section.`,
                branchId: msg.branchId,
                branchName: msg.branchName,
                linkTab: 'system',
                recordId: msg.id,
                requiredPermission: 'sms.retry_failed',
                status: 'UNREAD',
                readByUsers: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              AuditService.log({
                userId: 'system',
                username: 'PANDORA_WORKER',
                userFullName: 'Pandora Background Queue Worker',
                branchId: msg.branchId,
                branchName: msg.branchName,
                action: 'SMS_FAILED',
                recordType: 'SMS',
                recordId: msg.id,
                newValue: JSON.stringify({
                  retryCount: msg.retryCount,
                  finalError: errorReason,
                  provider: 'PANDORA',
                }),
                reason: 'Permanent transmission failure; staff alert created',
              });

              failed++;
            }

            serverStore.recordSmsTelemetry({
              lastErrorSanitized: errorReason,
              lastErrorTime: new Date().toISOString(),
              lastSubmissionTime: new Date().toISOString(),
            });
          }
        } catch (msgErr: any) {
          const sanitizedErr = PandoraAdapter.sanitizeError(msgErr.message);
          msg.status = 'PENDING';
          msg.lockedAt = undefined;
          msg.lockedBy = undefined;
          msg.failureReason = sanitizedErr;
          serverStore.updateSmsMessage(msg);
          failed++;
        }
      }

      return { claimed: claimedMessages.length, sent, retried, failed };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Produce comprehensive diagnostics snapshot for administration screens.
   */
  public getDiagnostics(): SmsProviderDiagnostics {
    const validation = PandoraAdapter.validateConfiguration();

    const allMessages = serverStore.getSmsMessages();
    const telemetry = serverStore.getSmsTelemetry();

    const counts = {
      total: allMessages.length,
      pending: allMessages.filter(m => m.status === 'PENDING').length,
      sending: allMessages.filter(m => m.status === 'SENDING').length,
      sent: allMessages.filter(m => m.status === 'SENT').length,
      deliveredConfirmed: allMessages.filter(m => m.deliveryConfirmed === true).length,
      failed: allMessages.filter(m => m.status === 'FAILED').length,
      retrying: allMessages.filter(m => m.status === 'PENDING' && (m.retryCount || 0) > 0).length,
    };

    return {
      provider: 'Pandora Networks',
      environment: 'PRODUCTION',
      configurationStatus: validation.status,
      configurationMessage: validation.message,
      workerStatus: this.status,
      workerIntervalSeconds: this.getIntervalSeconds(),
      isSubmissionEnabled: validation.canSubmit,
      senderId: validation.senderId,
      hasApiKey: validation.hasPassword,
      isPlaceholderKey: validation.isPlaceholder,
      counts,
      lastSuccessfulSubmissionTime: telemetry.lastSuccessTime,
      lastSubmissionAttemptTime: telemetry.lastSubmissionTime,
      lastErrorSanitized: telemetry.lastErrorSanitized,
      lastErrorTime: telemetry.lastErrorTime,
      balanceEstimateUGX: telemetry.balanceEstimateUGX,
      sandboxNotice: !validation.canSubmit
        ? 'Pandora SMS is the exclusive provider for Turihamwe Management System. Outbound messages remain queued safely until authorized production credentials (PANDORA_SMS_PHONE_NUMBER and PANDORA_SMS_PASSWORD) are configured on the backend.'
        : undefined,
      deliveryReceiptsSupported: false,
    };
  }
}

export const smsQueueWorker = SmsQueueWorker.getInstance();
