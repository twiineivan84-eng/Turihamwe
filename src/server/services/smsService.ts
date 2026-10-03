import { SmsMessage, SmsTemplate, NotificationEvent, TurihamwePlan, SaccoMember, TurihamweClaim } from '../../types';
import { serverStore } from '../storage/serverStore';
import { AuditService } from './auditService';
import { config } from '../config';

export class SmsService {
  /**
   * Replace template variables such as [Member Name], [Expiry Date], etc.
   */
  public static interpolateTemplate(
    templateText: string,
    variables: Record<string, string | number | undefined>
  ): string {
    let result = templateText;
    for (const [key, val] of Object.entries(variables)) {
      const cleanVal = val !== undefined && val !== null ? String(val) : '';
      // Support [Key] and [key] format
      const regex = new RegExp(`\\[${key}\\]`, 'gi');
      result = result.replace(regex, cleanVal);
    }
    return result;
  }

  /**
   * Format phone number to E.164 Uganda format (+256...)
   */
  public static formatUgandanPhone(phone: string): string {
    let clean = phone.replace(/[^0-9+]/g, '');
    if (clean.startsWith('0')) {
      clean = '+256' + clean.substring(1);
    } else if (clean.startsWith('256')) {
      clean = '+' + clean;
    } else if (!clean.startsWith('+')) {
      clean = '+256' + clean;
    }
    return clean;
  }

  /**
   * Queue an SMS message with strict deduplication
   */
  public static queueMessage(params: {
    recipientPhone: string;
    recipientName: string;
    messageText: string;
    branchId: string;
    branchName: string;
    queuedByUserId: string;
    queuedByUserFullName: string;
    saccoAccountNumber?: string;
    planId?: string;
    claimId?: string;
    eventId?: string;
    eventReferenceKey?: string;
    templateCategory?: any;
  }): { message?: SmsMessage; isDuplicate: boolean; duplicateReason?: string } {
    // 1. Strict Duplicate Check
    if (params.eventReferenceKey) {
      const existing = serverStore.getSmsMessages().find(
        m => m.eventReferenceKey === params.eventReferenceKey && (m.status === 'SENT' || m.status === 'PENDING' || m.status === 'SENDING')
      );
      if (existing) {
        return {
          isDuplicate: true,
          duplicateReason: `Duplicate prevented: SMS with key '${params.eventReferenceKey}' already in status ${existing.status} (ID: ${existing.id})`,
        };
      }
    }

    const formattedPhone = this.formatUgandanPhone(params.recipientPhone);

    const newMessage: SmsMessage = {
      id: `sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventId: params.eventId,
      eventReferenceKey: params.eventReferenceKey,
      recipientPhone: formattedPhone,
      recipientName: params.recipientName,
      saccoAccountNumber: params.saccoAccountNumber,
      planId: params.planId,
      claimId: params.claimId,
      branchId: params.branchId,
      branchName: params.branchName,
      messageText: params.messageText,
      templateCategory: params.templateCategory,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
      provider: 'AFRICAS_TALKING',
      queuedByUserId: params.queuedByUserId,
      queuedByUserFullName: params.queuedByUserFullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: true,
    };

    serverStore.addSmsMessage(newMessage);

    AuditService.log({
      userId: params.queuedByUserId,
      username: params.queuedByUserFullName,
      userFullName: params.queuedByUserFullName,
      branchId: params.branchId,
      branchName: params.branchName,
      action: 'SMS_QUEUED',
      recordType: 'SMS',
      recordId: newMessage.id,
      newValue: JSON.stringify({
        recipient: formattedPhone,
        eventKey: params.eventReferenceKey,
        length: params.messageText.length,
      }),
      reason: 'Outbound SMS notification queued in system pipeline',
    });

    return { message: newMessage, isDuplicate: false };
  }

  /**
   * Dispatch an SMS message through Africa's Talking API
   */
  public static async dispatchMessage(messageId: string): Promise<{ success: boolean; message: SmsMessage; error?: string }> {
    const sms = serverStore.getSmsById(messageId);
    if (!sms) {
      throw new Error(`SMS record with ID ${messageId} not found`);
    }

    if (sms.status === 'SENT') {
      return { success: true, message: sms };
    }

    if (!config.sms.enabled) {
      sms.status = 'SENT';
      sms.updatedAt = new Date().toISOString();
      serverStore.updateSmsMessage(sms);
      return { success: true, message: sms };
    }

    sms.status = 'SENDING';
    sms.updatedAt = new Date().toISOString();
    serverStore.updateSmsMessage(sms);

    const apiKey = config.sms.apiKey;
    const username = config.sms.username;
    const isSandbox = config.sms.environment === 'SANDBOX' || !apiKey || username.toLowerCase() === 'sandbox';
    const senderId = config.sms.senderId;

    try {
      if (apiKey && !isSandbox) {
        // Production or active Sandbox with live API credentials
        const endpoint = 'https://api.africastalking.com/version1/messaging';
        const bodyParams = new URLSearchParams({
          username,
          to: sms.recipientPhone,
          message: sms.messageText,
        });
        if (senderId) bodyParams.append('from', senderId);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apiKey': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: bodyParams.toString(),
        });

        const data: any = await response.json();
        const recipient = data?.SMSMessageData?.Recipients?.[0];

        if (recipient && (recipient.status === 'Success' || recipient.statusCode === 101)) {
          sms.status = 'SENT';
          sms.sentAt = new Date().toISOString();
          sms.providerMessageId = recipient.messageId || `ATXid_${Date.now()}`;
          sms.providerCostUGX = recipient.cost ? parseFloat(recipient.cost.replace(/[^0-9.]/g, '')) : 30.0;
          sms.deliveryStatus = recipient.status;
          sms.failureReason = undefined;
        } else {
          throw new Error(recipient?.status || data?.SMSMessageData?.Message || 'Africa\'s Talking API rejected dispatch');
        }
      } else {
        // Africa's Talking Sandbox Simulation / Development Mode
        // Validates Ugandan phone numbers (+256...)
        if (!sms.recipientPhone.startsWith('+256')) {
          throw new Error('Invalid telephone format: Ugandan international format (+256...) is required');
        }

        // Simulate successful sandbox delivery
        sms.status = 'SENT';
        sms.sentAt = new Date().toISOString();
        sms.providerMessageId = `ATXid_sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        sms.providerCostUGX = 30.0; // Standard Uganda SMS rate
        sms.deliveryStatus = 'Success';
        sms.failureReason = undefined;
      }

      sms.updatedAt = new Date().toISOString();
      serverStore.updateSmsMessage(sms);

      AuditService.log({
        userId: 'system',
        username: 'AFRICAS_TALKING_GATEWAY',
        userFullName: 'Africa\'s Talking SMS Gateway',
        branchId: sms.branchId,
        branchName: sms.branchName,
        action: 'SMS_SENT',
        recordType: 'SMS',
        recordId: sms.id,
        newValue: JSON.stringify({
          providerMsgId: sms.providerMessageId,
          costUGX: sms.providerCostUGX,
          recipient: sms.recipientPhone,
        }),
        reason: 'SMS successfully dispatched to telecommunications network',
      });

      return { success: true, message: sms };
    } catch (err: any) {
      sms.status = 'FAILED';
      sms.failedAt = new Date().toISOString();
      sms.failureReason = err.message || 'Transmission timeout to SMS gateway';
      sms.retryCount += 1;
      sms.updatedAt = new Date().toISOString();
      serverStore.updateSmsMessage(sms);

      // Create an alert for staff
      serverStore.addAlert({
        id: `alt-sms-${Date.now()}`,
        category: 'SMS_FAILURE',
        severity: 'WARNING',
        title: `SMS Dispatch Failed to ${sms.recipientName}`,
        message: `Failed to deliver notification to ${sms.recipientPhone}: ${sms.failureReason}. Click to retry in SMS Queue.`,
        branchId: sms.branchId,
        branchName: sms.branchName,
        linkTab: 'system',
        recordId: sms.id,
        requiredPermission: 'sms.retry_failed',
        status: 'UNREAD',
        readByUsers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      AuditService.log({
        userId: 'system',
        username: 'SMS_GATEWAY',
        userFullName: 'Africa\'s Talking Gateway',
        branchId: sms.branchId,
        branchName: sms.branchName,
        action: 'SMS_FAILED',
        recordType: 'SMS',
        recordId: sms.id,
        newValue: JSON.stringify({ error: sms.failureReason, retries: sms.retryCount }),
        reason: 'SMS transmission failed; alert generated for branch review',
      });

      return { success: false, message: sms, error: sms.failureReason };
    }
  }

  /**
   * Process all pending messages in queue
   */
  public static async processQueue(): Promise<{ processed: number; sent: number; failed: number }> {
    const queue = serverStore.getSmsMessages().filter(m => m.status === 'PENDING');
    let sent = 0;
    let failed = 0;

    for (const msg of queue) {
      const res = await this.dispatchMessage(msg.id);
      if (res.success) sent++;
      else failed++;
    }

    return { processed: queue.length, sent, failed };
  }

  /**
   * Automatically generate expiry notification events (30d, 14d, 7d, due date)
   */
  public static evaluateExpiryNotificationEvents(): { eventsCreated: number; messagesQueued: number } {
    const plans = serverStore.getPlans().filter(p => p.status === 'ACTIVE');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let eventsCreated = 0;
    let messagesQueued = 0;

    for (const plan of plans) {
      const expiry = new Date(plan.currentExpiryDate);
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let eventType: any = null;
      let templateCategory: any = null;

      if (diffDays === 30) {
        eventType = 'EXPIRY_30_DAYS';
        templateCategory = 'EXPIRY_REMINDER_30_DAYS';
      } else if (diffDays === 14) {
        eventType = 'EXPIRY_14_DAYS';
        templateCategory = 'EXPIRY_REMINDER_14_DAYS';
      } else if (diffDays === 7) {
        eventType = 'EXPIRY_7_DAYS';
        templateCategory = 'EXPIRY_REMINDER_7_DAYS';
      } else if (diffDays === 0) {
        eventType = 'EXPIRY_DUE_TODAY';
        templateCategory = 'EXPIRY_DATE_NOTICE';
      }

      if (eventType && templateCategory) {
        const deduplicationKey = `${eventType}::${plan.id}::${todayStr}`;
        const existingEvent = serverStore.getNotificationEvents().find(e => e.deduplicationKey === deduplicationKey);

        if (!existingEvent) {
          const member = serverStore.getMemberByAccountNumber(plan.saccoAccountNumber);
          if (member && member.primaryPhone) {
            const newEvent: NotificationEvent = {
              id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              eventType,
              deduplicationKey,
              saccoAccountNumber: plan.saccoAccountNumber,
              memberName: member.fullName,
              recipientPhone: member.primaryPhone,
              planId: plan.id,
              branchId: plan.registeredBranchId,
              branchName: plan.registeredBranchName || 'Nyamuyanja Branch',
              description: `Automated expiry notification (${diffDays} days remaining) for policy ${plan.planCode || plan.id}`,
              processed: true,
              processedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            };

            serverStore.addNotificationEvent(newEvent);
            eventsCreated++;

            // Find matching template
            const template = serverStore.getSmsTemplates().find(t => t.category === templateCategory && t.isActive) ||
              serverStore.getSmsTemplates().find(t => t.category === 'EXPIRY_REMINDER_30_DAYS' && t.isActive);

            const defaultText = `Dear [Member Name], your Turihamwe cover with Nyamuyanja SACCO expires on [Expiry Date]. Please renew at [Branch] before the expiry date to maintain your funeral coverage benefits.`;
            const templateText = template?.templateText || defaultText;

            const interpolated = this.interpolateTemplate(templateText, {
              'Member Name': member.fullName,
              'Expiry Date': plan.currentExpiryDate,
              'Branch': plan.registeredBranchName || 'Nyamuyanja Branch',
              'Policy Code': plan.planCode || plan.id,
              'Account Number': member.saccoAccountNumber,
            });

            const queueResult = this.queueMessage({
              recipientPhone: member.primaryPhone,
              recipientName: member.fullName,
              messageText: interpolated,
              branchId: plan.registeredBranchId,
              branchName: plan.registeredBranchName || 'Nyamuyanja Branch',
              queuedByUserId: 'system',
              queuedByUserFullName: 'Turihamwe Automated Lifecycle Scheduler',
              saccoAccountNumber: member.saccoAccountNumber,
              planId: plan.id,
              eventId: newEvent.id,
              eventReferenceKey: deduplicationKey,
              templateCategory,
            });

            if (!queueResult.isDuplicate && queueResult.message) {
              newEvent.smsMessageId = queueResult.message.id;
              serverStore.updateNotificationEvent(newEvent);
              messagesQueued++;
            }
          }
        }
      }
    }

    return { eventsCreated, messagesQueued };
  }
}
