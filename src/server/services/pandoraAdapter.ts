import { config } from '../config';
import { SmsConfigurationStatus } from '../../types';
import { PandoraSmsService } from './pandoraSmsService';

export interface PandoraValidationResult {
  status: SmsConfigurationStatus;
  provider: 'PANDORA';
  canSubmit: boolean;
  message: string;
  senderId: string;
  hasUsername: boolean;
  hasPhoneNumber?: boolean;
  hasPassword: boolean;
  isPlaceholder: boolean;
  apiUrl: string;
}

export interface PandoraSubmissionResult {
  success: boolean;
  providerMessageId?: string;
  costUGX?: number;
  deliveryStatus?: string;
  statusCode?: number;
  error?: string;
  isTransientFailure?: boolean;
  deliveryConfirmed?: boolean;
}

export interface PandoraConnectionTestResult {
  connected: boolean;
  provider: 'PANDORA';
  balanceUGX?: string | null;
  message: string;
  error?: string;
  checkedAt: string;
}

export class PandoraAdapter {
  public static readonly DEFAULT_API_URL = PandoraSmsService.DEFAULT_API_URL;
  public static readonly DEFAULT_BALANCE_URL = PandoraSmsService.DEFAULT_BALANCE_URL;

  /**
   * Redact passwords, usernames, and secret tokens so sensitive credentials
   * are NEVER leaked into error messages, audit logs, or telemetry payloads.
   */
  public static sanitizeError(errorText: string | undefined | null): string {
    return PandoraSmsService.sanitizeError(errorText);
  }

  /**
   * Validate configuration status for Pandora SMS.
   * Never throws so callers can safely inspect system diagnostics.
   */
  public static validateConfiguration(): PandoraValidationResult {
    const isEnabled = config.sms.enabled;
    const pandoraCfg = config.sms.pandora || {
      apiUrl: PandoraAdapter.DEFAULT_API_URL,
      balanceUrl: PandoraAdapter.DEFAULT_BALANCE_URL,
      phoneNumber: '',
      username: '',
      password: '',
      senderId: 'NYAMUYANJA',
    };

    const rawAccountIdentifier = ((pandoraCfg as any).phoneNumber || pandoraCfg.username || '').trim();
    const rawPassword = (pandoraCfg.password || '').trim();
    const rawSenderId = (pandoraCfg.senderId || 'NYAMUYANJA').trim();

    const hasUsername = Boolean(rawAccountIdentifier);
    const hasPhoneNumber = Boolean(rawAccountIdentifier);
    const hasPassword = Boolean(rawPassword);

    const isPlaceholder =
      !hasUsername ||
      !hasPassword ||
      rawAccountIdentifier.toLowerCase().includes('placeholder') ||
      rawPassword.toLowerCase().includes('placeholder') ||
      rawAccountIdentifier === 'pandora_user' ||
      rawPassword === 'pandora_pass';

    if (!isEnabled) {
      return {
        status: 'DISABLED',
        provider: 'PANDORA',
        canSubmit: false,
        message: 'SMS provider dispatch is disabled via SMS_ENABLED=false.',
        senderId: rawSenderId,
        hasUsername,
        hasPhoneNumber,
        hasPassword,
        isPlaceholder,
        apiUrl: pandoraCfg.apiUrl,
      };
    }

    if (isPlaceholder || !hasUsername || !hasPassword) {
      return {
        status: 'MISSING',
        provider: 'PANDORA',
        canSubmit: false,
        message:
          'Pandora SMS submission is not configured on this deployment, so queued messages stay in the queue and are never marked as sent. Provider credentials are held only by the secure backend service, never by this interface.',
        senderId: rawSenderId,
        hasUsername,
        hasPhoneNumber,
        hasPassword,
        isPlaceholder: true,
        apiUrl: pandoraCfg.apiUrl,
      };
    }

    // Validate Sender ID: Alphanumeric max 11 characters (GSM standard)
    if (rawSenderId.length > 11) {
      return {
        status: 'INVALID',
        provider: 'PANDORA',
        canSubmit: false,
        message: `Invalid Sender ID '${rawSenderId}': Exceeds 11-character maximum alphanumeric limit required by Ugandan telcos and Pandora SMS. Use 'NYAMUYANJA' (10 chars).`,
        senderId: rawSenderId,
        hasUsername,
        hasPassword,
        isPlaceholder: false,
        apiUrl: pandoraCfg.apiUrl,
      };
    }

    return {
      status: 'CONFIGURED',
      provider: 'PANDORA',
      canSubmit: true,
      message: 'Pandora SMS is configured and ready for transactional dispatch to Ugandan networks.',
      senderId: rawSenderId,
      hasUsername: true,
      hasPassword: true,
      isPlaceholder: false,
      apiUrl: pandoraCfg.apiUrl,
    };
  }

  /**
   * Normalizes a phone number for Uganda networks (MTN, Airtel).
   * E.g. "+256701234567" -> "256701234567" or "+256701234567"
   */
  public static normalizeUgandanPhone(phone: string): string {
    return PandoraSmsService.normalizeUgandanPhone(phone);
  }

  /**
   * Sanitizes and normalizes an alphanumeric Sender ID to comply with GSM-7 max 11 chars.
   */
  public static sanitizeSenderId(senderId?: string): string {
    return PandoraSmsService.sanitizeSenderId(senderId);
  }

  /**
   * Safely submit an SMS via Pandora Networks official API.
   * Delegates to PandoraSmsService.sendSms.
   */
  public static async submitMessage(params: {
    to: string;
    messageText: string;
    senderId?: string;
  }): Promise<PandoraSubmissionResult> {
    const res = await PandoraSmsService.sendSms({
      to: params.to,
      message: params.messageText,
      senderId: params.senderId,
    });

    return {
      success: res.success,
      providerMessageId: res.messageId,
      costUGX: res.costUGX,
      deliveryStatus: res.deliveryStatus,
      statusCode: res.statusCode,
      error: res.error,
      isTransientFailure: res.isTransientFailure,
      deliveryConfirmed: res.deliveryConfirmed,
    };
  }

  /**
   * Diagnostic connection and balance verification.
   * Strictly queries balance endpoint; DOES NOT send any SMS messages.
   * Delegates to PandoraSmsService.testConnection.
   */
  public static async testConnection(): Promise<PandoraConnectionTestResult> {
    const res = await PandoraSmsService.testConnection();
    return {
      connected: res.connected,
      provider: 'PANDORA',
      balanceUGX: res.balanceUGX,
      message: res.message,
      error: res.error,
      checkedAt: res.checkedAt,
    };
  }
}
