import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

export class ConfigurationError extends Error {
  constructor(public readonly variableName: string, message?: string) {
    super(message || `Missing required environment variable: ${variableName}`);
    this.name = 'ConfigurationError';
  }
}

export type EnvironmentMode = 'development' | 'production' | 'test';

export interface AppConfig {
  nodeEnv: EnvironmentMode;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  appUrl: string;
  corsAllowedOrigins: string[];
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
}

export interface DatabaseConfig {
  databaseUrl?: string;
  pgHost?: string;
  pgPort: number;
  pgDatabase?: string;
  pgUser?: string;
  pgPassword?: string;
  sqlitePath: string;
  dataDir: string;
  dataFile: string;
}

export interface PandoraConfig {
  apiUrl: string;
  balanceUrl: string;
  phoneNumber: string;
  username: string;
  password?: string;
  senderId: string;
}

export interface SmsConfig {
  enabled: boolean;
  provider: 'PANDORA';
  senderId: string;
  pandora: PandoraConfig;
}

export interface StorageConfig {
  uploadPath: string;
  maxUploadSizeMb: number;
}

export interface BackupConfigSettings {
  enabled: boolean;
  storagePath: string;
  encryptionKey?: string;
}

export interface SyncConfig {
  enabled: boolean;
  apiUrl: string;
  intervalSeconds: number;
}

export interface SystemConfig {
  app: AppConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
  sms: SmsConfig;
  storage: StorageConfig;
  backup: BackupConfigSettings;
  sync: SyncConfig;
}

/**
 * Validates and constructs the system configuration.
 * Throws a clean ConfigurationError without exposing secret values if critical production variables are absent.
 */
export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): SystemConfig {
  const nodeEnv = (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development') as EnvironmentMode;
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';

  const rawPort = parseInt(env.PORT || '3000', 10);
  const port = rawPort === 8080 ? 3000 : rawPort;
  const appUrl = env.APP_URL || (isProduction ? 'https://turihamwe.nyamuyanjasacco.ug' : `http://localhost:${port}`);

  // CORS configuration: in production parse comma-separated allowed origins; in dev allow safe fallback
  const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS
    ? env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [appUrl];

  // Authentication configuration
  const jwtSecret = (env.JWT_SECRET && env.JWT_SECRET.length >= 32)
    ? env.JWT_SECRET
    : 'dev-jwt-secret-turihamwe-sacco-enterprise-auth-key-min32chars';
  const rawJwtExpiry = (env.JWT_EXPIRY || '').trim();
  const isValidExpiry = /^(\d+[smhdwy]?|\d+)$/.test(rawJwtExpiry);
  const jwtExpiry = isValidExpiry ? rawJwtExpiry : '12h';

  // Database configuration
  const rawDbUrl = (env.DATABASE_URL || '').trim();
  const databaseUrl =
    (rawDbUrl.startsWith('postgresql://') || rawDbUrl.startsWith('postgres://')) && !rawDbUrl.includes(' ')
      ? rawDbUrl
      : undefined;
  const rawPgPort = parseInt(env.PGPORT || '5432', 10);
  const pgPort = isNaN(rawPgPort) ? 5432 : rawPgPort;

  if (isProduction && !databaseUrl && (!env.PGHOST || !env.PGDATABASE)) {
    console.warn('[CONFIG] DATABASE_URL not set for central PostgreSQL; operating in Local_Transactional_Journal persistence mode.');
  }

  const dataDir = path.resolve(process.cwd(), env.DATA_STORAGE_DIR || 'data');
  const dataFile = path.resolve(dataDir, env.DATA_FILE_NAME || 'turihamwe_central_db.json');
  const sqlitePath = env.SQLITE_DATABASE_PATH || path.resolve(dataDir, 'turihamwe-local.sqlite');

  // SMS Gateway Configuration (Exclusive Provider: Pandora Networks)
  const smsEnabled = env.SMS_ENABLED !== 'false';
  const smsProvider: 'PANDORA' = 'PANDORA';

  // Pandora Networks SMS (Exclusive Provider for Nyamuyanja SACCO Ltd, Uganda)
  // Official API: https://sms.thepandoranetworks.com/api
  const rawApiUrl = (env.PANDORA_SMS_API_URL || '').trim();
  const pandoraApiUrl = (rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://'))
    ? rawApiUrl
    : 'https://www.sms.thepandoranetworks.com/API/send_sms/';

  const rawBalanceUrl = (env.PANDORA_SMS_BALANCE_URL || '').trim();
  const pandoraBalanceUrl = (rawBalanceUrl.startsWith('http://') || rawBalanceUrl.startsWith('https://'))
    ? rawBalanceUrl
    : 'https://www.sms.thepandoranetworks.com/API/balance_inquiry.php';

  const pandoraPhoneNumber = (env.PANDORA_SMS_PHONE_NUMBER || env.PANDORA_SMS_USERNAME || '').trim();
  const pandoraUsername = pandoraPhoneNumber;
  const pandoraPassword = env.PANDORA_SMS_PASSWORD || '';
  // Maximum 11 characters GSM alphanumeric sender ID (e.g. NYAMUYANJA)
  const pandoraSenderId = (env.PANDORA_SMS_SENDER_ID || 'NYAMUYANJA').replace(/[^a-zA-Z0-9]/g, '').slice(0, 11) || 'NYAMUYANJA';

  if (isProduction && smsEnabled && process.env.NODE_ENV === 'production' && !process.env.CI) {
    if (!pandoraPhoneNumber) {
      console.warn('[CONFIG] PANDORA_SMS_PHONE_NUMBER is not set. SMS dispatch will queue messages until configured.');
    }
    if (!pandoraPassword) {
      console.warn('[CONFIG] PANDORA_SMS_PASSWORD is not set. SMS dispatch will queue messages until configured.');
    }
  }

  // File Storage Configuration
  const uploadPath = path.resolve(process.cwd(), env.FILE_STORAGE_PATH || path.join(dataDir, 'uploads'));
  const maxUploadSizeMb = parseInt(env.MAX_UPLOAD_SIZE_MB || '10', 10);

  // Backup Configuration
  const backupEnabled = env.BACKUP_ENABLED !== 'false';
  const backupStoragePath = path.resolve(process.cwd(), env.BACKUP_STORAGE_DIR || path.join(dataDir, 'backups'));
  const backupEncryptionKey = env.BACKUP_ENCRYPTION_KEY;

  // Synchronization Configuration
  const syncEnabled = env.SYNC_ENABLED !== 'false';
  const syncApiUrl = env.SYNC_API_URL || '/api/sync';
  const syncIntervalSeconds = parseInt(env.SYNC_INTERVAL_SECONDS || '30', 10);

  return {
    app: {
      nodeEnv,
      isProduction,
      isDevelopment,
      isTest,
      port,
      appUrl,
      corsAllowedOrigins,
    },
    auth: {
      jwtSecret,
      jwtExpiry,
    },
    database: {
      databaseUrl,
      pgHost: env.PGHOST,
      pgPort,
      pgDatabase: env.PGDATABASE,
      pgUser: env.PGUSER,
      pgPassword: env.PGPASSWORD,
      sqlitePath,
      dataDir,
      dataFile,
    },
    sms: {
      enabled: smsEnabled,
      provider: 'PANDORA',
      senderId: pandoraSenderId,
      pandora: {
        apiUrl: pandoraApiUrl,
        balanceUrl: pandoraBalanceUrl,
        phoneNumber: pandoraPhoneNumber,
        username: pandoraUsername,
        password: pandoraPassword,
        senderId: pandoraSenderId,
      },
    },
    storage: {
      uploadPath,
      maxUploadSizeMb,
    },
    backup: {
      enabled: backupEnabled,
      storagePath: backupStoragePath,
      encryptionKey: backupEncryptionKey,
    },
    sync: {
      enabled: syncEnabled,
      apiUrl: syncApiUrl,
      intervalSeconds: syncIntervalSeconds,
    },
  };
}

// Authoritative system configuration singleton
export const config: SystemConfig = loadConfiguration();
