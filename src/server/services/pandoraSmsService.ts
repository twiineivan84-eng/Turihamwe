/**
 * PandoraSmsService — Official Pandora Networks SMS Gateway Service
 * Organization: Nyamuyanja SACCO Ltd, Uganda
 * 
 * Provides production-grade integration with the official Pandora Networks API:
 * - Submission: https://www.sms.thepandoranetworks.com/API/send_sms/
 * - Balance Inquiry: https://www.sms.thepandoranetworks.com/API/balance_inquiry.php
 * 
 * Authentication uses registered phone number (PANDORA_SMS_PHONE_NUMBER) and password (PANDORA_SMS_PASSWORD).
 * Passwords and secrets are strictly redacted from all error messages, logs, and telemetry.
 * Safe connection test performs balance inquiry without sending any SMS messages.
 */

import { config } from '../config';

export interface PandoraServiceValidationResult {
  configured: boolean;
  canSubmit: boolean;
  phoneNumber: string;
  senderId: string;
  message: string;
  isPlaceholder: boolean;
  status: 'CONFIGURED' | 'MISSING' | 'INVALID' | 'DISABLED';
  apiUrl: string;
  balanceUrl: string;
}

export interface PandoraServiceSendResult {
  success: boolean;
  messageId?: string;
  costUGX?: number;
  deliveryStatus?: string;
  deliveryConfirmed?: boolean;
  statusCode?: number;
  error?: string;
  isTransientFailure?: boolean;
  rawResponse?: string;
}

export interface PandoraServiceBalanceResult {
  success: boolean;
  balanceUGX?: string | null;
  message: string;
  raw?: string;
  error?: string;
  checkedAt: string;
}

export interface PandoraServiceConnectionResult {
  connected: boolean;
  provider: 'PANDORA';
  balanceUGX?: string | null;
  message: string;
  error?: string;
  checkedAt: string;
}

export class PandoraSmsService {
  public static readonly DEFAULT_API_URL = 'https://www.sms.thepandoranetworks.com/API/send_sms/';
  public static readonly DEFAULT_BALANCE_URL = 'https://www.sms.thepandoranetworks.com/API/balance_inquiry.php';
  public static readonly DEFAULT_SENDER_ID = 'NYAMUYANJA';

  /**
   * Resolve current credentials directly from environment variables or active system config.
   * Prioritizes PANDORA_SMS_PHONE_NUMBER over username.
   */
  public static getCredentials(): {
    phoneNumber: string;
    password: string;
    apiUrl: string;
    balanceUrl: string;
    senderId: string;
    isEnabled: boolean;
  } {
    const isEnabled = config.sms.enabled !== false && process.env.SMS_ENABLED !== 'false';

    const pandoraCfg = config.sms.pandora || {} as any;

    const phoneNumber = (
      (pandoraCfg.phoneNumber !== undefined && pandoraCfg.phoneNumber !== ''
        ? pandoraCfg.phoneNumber
        : process.env.PANDORA_SMS_PHONE_NUMBER || pandoraCfg.username || process.env.PANDORA_SMS_USERNAME || '')
    ).trim();

    const password = (
      (pandoraCfg.password !== undefined
        ? pandoraCfg.password
        : process.env.PANDORA_SMS_PASSWORD || '')
    ).trim();

    const apiUrl = (
      pandoraCfg.apiUrl ||
      process.env.PANDORA_SMS_API_URL ||
      this.DEFAULT_API_URL
    ).trim();

    const balanceUrl = (
      pandoraCfg.balanceUrl ||
      process.env.PANDORA_SMS_BALANCE_URL ||
      this.DEFAULT_BALANCE_URL
    ).trim();

    const senderId = this.sanitizeSenderId(
      pandoraCfg.senderId ||
      process.env.PANDORA_SMS_SENDER_ID ||
      this.DEFAULT_SENDER_ID
    );

    return {
      phoneNumber,
      password,
      apiUrl,
      balanceUrl,
      senderId,
      isEnabled,
    };
  }

  /**
   * Redact passwords and secret credentials so sensitive data is NEVER leaked
   * into error messages, audit logs, or frontend API responses.
   */
  public static sanitizeError(errorText: string | undefined | null): string {
    if (!errorText) return 'Unknown communication error';
    let sanitized = String(errorText);

    const creds = this.getCredentials();
    if (creds.password && creds.password.length > 1) {
      sanitized = sanitized.split(creds.password).join('[REDACTED]');
    }

    // Also sanitize any config object password if different
    const cfgPass = config.sms.pandora?.password;
    if (cfgPass && cfgPass.length > 1) {
      sanitized = sanitized.split(cfgPass).join('[REDACTED]');
    }

    sanitized = sanitized.replace(/password[:=]\s*['"]?[^&'"\s]+['"]?/gi, 'password=[REDACTED]');
    sanitized = sanitized.replace(/username[:=]\s*['"]?[^&'"\s]+['"]?/gi, 'username=[REDACTED]');
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');

    return sanitized;
  }

  /**
   * Normalizes Ugandan phone numbers into canonical 12-digit format (256XXXXXXXXX).
   */
  public static normalizeUgandanPhone(phone: string): string {
    let clean = (phone || '').replace(/[^0-9+]/g, '');
    if (clean.startsWith('0')) {
      clean = '256' + clean.substring(1);
    } else if (clean.startsWith('+256')) {
      clean = clean.substring(1);
    } else if (!clean.startsWith('256')) {
      clean = '256' + clean;
    }
    return clean;
  }

  /**
   * Sanitizes alphanumeric Sender ID to comply with GSM-7 max 11 characters.
   */
  public static sanitizeSenderId(senderId?: string): string {
    const raw = (senderId || this.DEFAULT_SENDER_ID).trim();
    const alphanumeric = raw.replace(/[^a-zA-Z0-9]/g, '');
    if (alphanumeric.length > 11) {
      return alphanumeric.substring(0, 11);
    }
    return alphanumeric || this.DEFAULT_SENDER_ID;
  }

  /**
   * Validate configuration status for Pandora SMS.
   * Safe to call from UI and diagnostics without throwing.
   */
  public static validateConfiguration(): PandoraServiceValidationResult {
    const creds = this.getCredentials();

    const hasPhone = Boolean(creds.phoneNumber);
    const hasPassword = Boolean(creds.password);

    const isPlaceholder =
      !hasPhone ||
      !hasPassword ||
      creds.phoneNumber.toLowerCase().includes('placeholder') ||
      creds.password.toLowerCase().includes('placeholder') ||
      creds.phoneNumber === 'pandora_user' ||
      creds.password === 'pandora_pass';

    if (!creds.isEnabled) {
      return {
        configured: false,
        canSubmit: false,
        status: 'DISABLED',
        phoneNumber: creds.phoneNumber,
        senderId: creds.senderId,
        message: 'SMS dispatch is currently disabled via SMS_ENABLED=false.',
        isPlaceholder,
        apiUrl: creds.apiUrl,
        balanceUrl: creds.balanceUrl,
      };
    }

    if (isPlaceholder || !hasPhone || !hasPassword) {
      return {
        configured: false,
        canSubmit: false,
        status: 'MISSING',
        phoneNumber: creds.phoneNumber,
        senderId: creds.senderId,
        message: 'Pandora SMS is not configured on this deployment. PANDORA_SMS_PHONE_NUMBER and PANDORA_SMS_PASSWORD are required.',
        isPlaceholder: true,
        apiUrl: creds.apiUrl,
        balanceUrl: creds.balanceUrl,
      };
    }

    if (creds.senderId.length > 11) {
      return {
        configured: false,
        canSubmit: false,
        status: 'INVALID',
        phoneNumber: creds.phoneNumber,
        senderId: creds.senderId,
        message: `Invalid Sender ID '${creds.senderId}': Exceeds 11-character maximum alphanumeric limit required by Ugandan telcos and Pandora SMS.`,
        isPlaceholder: false,
        apiUrl: creds.apiUrl,
        balanceUrl: creds.balanceUrl,
      };
    }

    return {
      configured: true,
      canSubmit: true,
      status: 'CONFIGURED',
      phoneNumber: creds.phoneNumber,
      senderId: creds.senderId,
      message: 'Pandora SMS is configured and ready for transactional dispatch to Ugandan networks.',
      isPlaceholder: false,
      apiUrl: creds.apiUrl,
      balanceUrl: creds.balanceUrl,
    };
  }

  /**
   * Check account balance and credit availability via official Pandora balance endpoint.
   * URL: https://www.sms.thepandoranetworks.com/API/balance_inquiry.php
   * Query params: username, phone_number, password
   * DOES NOT send any SMS messages.
   */
  public static async checkBalance(): Promise<PandoraServiceBalanceResult> {
    const checkedAt = new Date().toISOString();
    const validation = this.validateConfiguration();

    if (!validation.canSubmit) {
      return {
        success: false,
        balanceUGX: null,
        message: validation.message,
        error: validation.message,
        checkedAt,
      };
    }

    const creds = this.getCredentials();
    const url = new URL(creds.balanceUrl);
    url.searchParams.set('username', creds.phoneNumber);
    url.searchParams.set('phone_number', creds.phoneNumber);
    url.searchParams.set('password', creds.password);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const raw = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Plain text or numeric balance response
      }

      if (response.ok) {
        const balance =
          parsed?.account_balance !== undefined
            ? String(parsed.account_balance)
            : parsed?.balance !== undefined
            ? String(parsed.balance)
            : parsed?.credits !== undefined
            ? String(parsed.credits)
            : raw.replace(/[^0-9.]/g, '') || 'Active';

        return {
          success: true,
          balanceUGX: balance,
          message: `Pandora balance retrieved successfully: ${balance} UGX / credits.`,
          raw: raw.substring(0, 100),
          checkedAt,
        };
      }

      // If GET returns 405 (Method Not Allowed), attempt fallback with POST
      if (response.status === 405) {
        try {
          const postPayload = new URLSearchParams({
            username: creds.phoneNumber,
            phone_number: creds.phoneNumber,
            password: creds.password,
          });
          const postRes = await fetch(creds.balanceUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json, text/plain, */*',
            },
            body: postPayload.toString(),
          });
          if (postRes.ok) {
            const postRaw = await postRes.text();
            let postParsed: any = null;
            try { postParsed = JSON.parse(postRaw); } catch {}
            const bal =
              postParsed?.account_balance !== undefined
                ? String(postParsed.account_balance)
                : postParsed?.balance !== undefined
                ? String(postParsed.balance)
                : postParsed?.credits !== undefined
                ? String(postParsed.credits)
                : postRaw.replace(/[^0-9.]/g, '') || 'Active';
            return {
              success: true,
              balanceUGX: bal,
              message: `Pandora balance retrieved successfully: ${bal} UGX / credits.`,
              raw: postRaw.substring(0, 100),
              checkedAt,
            };
          }
        } catch {
          // If fallback fails, continue to report sanitized 405 error
        }
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          balanceUGX: null,
          message: 'Authentication failed: Invalid Pandora phone number or password.',
          error: 'Authentication failed: Invalid credentials.',
          checkedAt,
        };
      }

      if (response.status === 405) {
        return {
          success: false,
          balanceUGX: null,
          message: 'Pandora API returned HTTP 405: Method Not Allowed. The balance inquiry endpoint requires a different HTTP request method or endpoint path.',
          error: this.sanitizeError(raw.substring(0, 150)),
          checkedAt,
        };
      }

      return {
        success: false,
        balanceUGX: null,
        message: `Pandora balance inquiry returned HTTP ${response.status}`,
        error: this.sanitizeError(raw.substring(0, 150)),
        checkedAt,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const msg = isTimeout
        ? 'Network timeout: Pandora balance endpoint did not respond within 10 seconds.'
        : `Network error connecting to Pandora balance endpoint: ${err.message}`;

      return {
        success: false,
        balanceUGX: null,
        message: msg,
        error: this.sanitizeError(msg),
        checkedAt,
      };
    }
  }

  /**
   * Diagnostic connection test for admin UI and system checks.
   * Verifies credentials via checkBalance(); strictly avoids sending SMS.
   */
  public static async testConnection(): Promise<PandoraServiceConnectionResult> {
    const balanceResult = await this.checkBalance();

    return {
      connected: balanceResult.success,
      provider: 'PANDORA',
      balanceUGX: balanceResult.balanceUGX,
      message: balanceResult.success
        ? `Connection verified: Pandora SMS gateway reachable. Available balance: ${balanceResult.balanceUGX}`
        : balanceResult.message,
      error: balanceResult.error,
      checkedAt: balanceResult.checkedAt,
    };
  }

  /**
   * Send SMS via the official Pandora Networks API.
   * Endpoint: https://www.sms.thepandoranetworks.com/API/send_sms/
   * Request format: POST application/x-www-form-urlencoded
   * Parameters: Username, Password, Number, Message, Sender, message_type, message_category
   */
  public static async sendSms(params: {
    to: string;
    message: string;
    senderId?: string;
  }): Promise<PandoraServiceSendResult> {
    const validation = this.validateConfiguration();
    if (!validation.canSubmit) {
      return {
        success: false,
        error: validation.message,
        isTransientFailure: false,
      };
    }

    const creds = this.getCredentials();
    const recipient = this.normalizeUgandanPhone(params.to);

    if (!recipient.startsWith('256') || recipient.length !== 12) {
      return {
        success: false,
        error: `Invalid Uganda phone number '${params.to}'. Must be a 12-digit number beginning with 256 (e.g. 256772123456).`,
        isTransientFailure: false,
      };
    }

    const sender = this.sanitizeSenderId(params.senderId || creds.senderId);

    const payload = new URLSearchParams({
      Username: creds.phoneNumber,
      Password: creds.password,
      Number: recipient,
      Message: params.message,
      Sender: sender,
      message_type: 'non_customised',
      message_category: 'bulk',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second timeout

    try {
      const response = await fetch(creds.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
        },
        body: payload.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawText = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Plain text or HTML error
      }

      if (response.ok) {
        const isSuccess =
          parsed?.success === true ||
          parsed?.status === 'success' ||
          (typeof parsed?.message === 'string' && parsed.message.toLowerCase().includes('success')) ||
          rawText.toLowerCase().includes('success');

        if (isSuccess) {
          const providerMsgId =
            parsed?.message_id ||
            parsed?.id ||
            parsed?.transaction_ref ||
            rawText.match(/ID:\s*([A-Za-z0-9_-]+)/i)?.[1] ||
            `pandora-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

          return {
            success: true,
            messageId: providerMsgId,
            costUGX: 30.0,
            deliveryStatus: 'Submitted',
            deliveryConfirmed: false,
            statusCode: 200,
            rawResponse: rawText.substring(0, 200),
          };
        } else {
          const rawErr =
            parsed?.error_message ||
            parsed?.error ||
            parsed?.message ||
            rawText ||
            'Pandora SMS rejected message submission';

          return {
            success: false,
            statusCode: response.status,
            error: this.sanitizeError(rawErr),
            isTransientFailure: false,
          };
        }
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          statusCode: response.status,
          error: 'Pandora SMS Authentication Failed: Invalid Phone Number or Password.',
          isTransientFailure: false,
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          statusCode: 429,
          error: 'Pandora SMS Rate Limit Exceeded: Eligible for retry.',
          isTransientFailure: true,
        };
      }

      return {
        success: false,
        statusCode: response.status,
        error: this.sanitizeError(`Pandora API returned HTTP ${response.status}: ${rawText.substring(0, 200)}`),
        isTransientFailure: response.status >= 500,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'Network timeout: Pandora API did not respond within 12 seconds. Submission outcome uncertain; scheduled for guarded retry.',
          isTransientFailure: true,
        };
      }

      return {
        success: false,
        error: this.sanitizeError(`Network communication error with Pandora SMS: ${err.message}`),
        isTransientFailure: true,
      };
    }
  }
}
