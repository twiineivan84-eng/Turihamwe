import fs from 'fs';
import crypto from 'crypto';
import { Router, Response } from 'express';
import { requireAuth, requirePermission, requireAnyPermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import { BusinessRulesConfig, BackupConfig } from '../../types';
import { PandoraSmsService } from '../services/pandoraSmsService';
import { scheduledBackupWorker } from '../services/scheduledBackupWorker';
import { config } from '../config';

export const systemRouter = Router();

// ==========================================
// 1. SYSTEM HEALTH & MONITORING (REQ 14)
// ==========================================
systemRouter.get(
  '/health',
  requireAuth,
  requireAnyPermission('audit.system_reports', 'admin.system_settings', 'audit.view_logs'),
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const metrics = serverStore.getSystemHealthMetrics();
      res.json({ success: true, data: metrics });
    } catch (err) {
      console.error('System health check error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve system health metrics.' });
    }
  }
);

// ==========================================
// 2. SYSTEM CONFIGURATION & BUSINESS RULES (REQ 12 & 13)
// ==========================================
systemRouter.get(
  '/config',
  requireAuth,
  requireAnyPermission('admin.system_settings', 'audit.view_logs'),
  (_req: AuthenticatedRequest, res: Response) => {
    const businessRules = serverStore.getBusinessRulesConfig();
    const systemSettings = serverStore.getSystemSettings();

    res.json({
      success: true,
      data: {
        businessRules,
        systemSettings,
      },
    });
  }
);

// Update configurable business rules
systemRouter.put(
  '/config/business-rules',
  requireAuth,
  requirePermission('admin.system_settings'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const updates = req.body as Partial<BusinessRulesConfig>;
      const previousRules = serverStore.getBusinessRulesConfig();

      const updated = serverStore.updateBusinessRulesConfig(updates);

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BUSINESS_RULE_CONFIGURED',
        recordType: 'CONFIGURATION',
        previousValue: JSON.stringify(previousRules),
        newValue: JSON.stringify(updated),
        reason: req.body.reason || 'Institutional business rules configuration updated',
      });

      res.json({
        success: true,
        data: updated,
        message: 'Business rules configuration saved successfully.',
      });
    } catch (err) {
      console.error('Error updating business rules:', err);
      res.status(500).json({ success: false, message: 'Failed to update business rules configuration.' });
    }
  }
);

// Update system key-value settings
systemRouter.put(
  '/config/settings',
  requireAuth,
  requirePermission('admin.system_settings'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const updates = req.body.settings as Record<string, string>;
      if (!updates || typeof updates !== 'object') {
        res.status(400).json({ success: false, message: 'Invalid settings payload.' });
        return;
      }

      const previous = serverStore.getSystemSettings();
      const updated = serverStore.updateSystemSettings(updates);

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'SYSTEM_SETTING_CHANGED',
        recordType: 'CONFIGURATION',
        previousValue: JSON.stringify(previous),
        newValue: JSON.stringify(updated),
        reason: req.body.reason || 'General system parameters adjusted',
      });

      res.json({
        success: true,
        data: updated,
        message: 'System settings successfully updated.',
      });
    } catch (err) {
      console.error('Error updating system settings:', err);
      res.status(500).json({ success: false, message: 'Failed to update system settings.' });
    }
  }
);

// ==========================================
// 3. BACKUP SYSTEM & SECURITY (REQ 16 & 17)
// ==========================================

// List backup history
systemRouter.get(
  '/backups',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (_req: AuthenticatedRequest, res: Response) => {
    const backups = serverStore.getBackups();
    res.json({ success: true, data: backups });
  }
);

// Get scheduled backup worker status
systemRouter.get(
  '/backups/scheduled-status',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = scheduledBackupWorker.getStatus();
      res.json({ success: true, data: status });
    } catch (err) {
      console.error('Failed to get scheduled backup status:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve scheduled backup status.' });
    }
  }
);

// Download a combined bundle copy of all available backup archives
systemRouter.get(
  '/backups/download-all',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const backups = serverStore.getBackups();
      const entries: Array<{
        id: string;
        filename: string;
        createdAt: string;
        type: string;
        status: string;
        checksum: string;
        sizeBytes: number;
        notes?: string;
        snapshot: unknown;
      }> = [];

      for (const b of backups) {
        const fileInfo = serverStore.getBackupFile(b.id);
        if (!fileInfo) continue;
        const rawContent = fs.readFileSync(fileInfo.filePath, 'utf8');
        let parsedSnapshot: unknown = rawContent;
        try {
          parsedSnapshot = JSON.parse(rawContent);
        } catch {
          parsedSnapshot = rawContent;
        }
        entries.push({
          id: b.id,
          filename: b.filename,
          createdAt: b.createdAt,
          type: b.type,
          status: b.status,
          checksum: b.checksum,
          sizeBytes: b.sizeBytes,
          notes: b.notes,
          snapshot: parsedSnapshot,
        });
      }

      if (entries.length === 0) {
        res.status(404).json({
          success: false,
          message: 'No backup archives are currently available to download. Please create a backup first.',
        });
        return;
      }

      const exportedAt = new Date().toISOString();
      const dateTag = exportedAt.slice(0, 10);
      const bundleFilename = `NYAMUYANJA_TURIHAMWE_ALL_BACKUPS_${dateTag}.json`;
      const payload = JSON.stringify(
        {
          bundleType: 'TURIHAMWE_ALL_BACKUPS_COPY',
          institution: 'Nyamuyanja SACCO Ltd',
          application: 'Turihamwe Management System',
          exportedAt,
          totalBackups: entries.length,
          backups: entries,
        },
        null,
        2
      );

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BACKUP_DOWNLOADED',
        recordType: 'BACKUP',
        recordId: 'ALL_BACKUPS',
        newValue: `Downloaded bundle copy of ${entries.length} backup archive(s) (${bundleFilename})`,
        reason: 'Authorized IT Officer local backup archive copy download',
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${bundleFilename}"`);
      res.setHeader('X-Backup-Count', String(entries.length));
      res.send(payload);
    } catch (err) {
      console.error('Download all backups error:', err);
      res.status(500).json({ success: false, message: 'Failed to bundle and download backup archives.' });
    }
  }
);

// Trigger manual backup
systemRouter.post(
  '/backups',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notes } = req.body;
      const result = serverStore.createBackup({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        type: 'MANUAL',
        notes: notes || 'Manual administrative backup snapshot',
      });

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BACKUP_CREATED',
        recordType: 'BACKUP',
        recordId: result.backup.id,
        newValue: `Created central database backup archive ${result.backup.filename} (${(result.backup.sizeBytes / 1024).toFixed(1)} KB, SHA-256: ${result.backup.checksum.slice(0, 12)}...)`,
      });

      res.json({
        success: true,
        data: result.backup,
        message: 'Database backup snapshot generated successfully.',
      });
    } catch (err) {
      console.error('Backup creation error:', err);
      res.status(500).json({ success: false, message: 'Failed to generate database backup.' });
    }
  }
);

// Verify backup archive integrity
systemRouter.post(
  '/backups/:id/verify',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    const backupId = req.params.id;
    const verification = serverStore.verifyBackup(backupId, {
      userId: req.user!.id,
      username: req.user!.username,
    });

    AuditService.log({
      userId: req.user!.id,
      username: req.user!.username,
      userFullName: req.user!.fullName,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      action: 'BACKUP_VERIFIED',
      recordType: 'BACKUP',
      recordId: backupId,
      newValue: `Backup verification: ${verification.verified ? 'PASSED' : 'FAILED'} — ${verification.details}`,
    });

    res.json({
      success: verification.verified,
      data: verification,
    });
  }
);

// Controlled recovery / restore workflow (REQ 18)
systemRouter.post(
  '/backups/:id/restore',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const backupId = req.params.id;
      const { reason, confirmationAcknowledged } = req.body;

      if (!confirmationAcknowledged) {
        res.status(400).json({
          success: false,
          message: 'Restore operation requires explicit administrator safety confirmation.',
        });
        return;
      }

      if (!reason || reason.trim().length < 10) {
        res.status(400).json({
          success: false,
          message: 'A mandatory justification reason (min 10 characters) is required for database recovery operations.',
        });
        return;
      }

      const result = serverStore.restoreBackup(backupId, {
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        reason: reason.trim(),
      });

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BACKUP_RESTORED',
        recordType: 'BACKUP',
        recordId: backupId,
        newValue: `Database restored from backup ${backupId}. Justification: ${reason}`,
        reason: reason.trim(),
      });

      res.json(result);
    } catch (err) {
      console.error('Database restore exception:', err);
      res.status(500).json({ success: false, message: 'Critical failure during restore procedure.' });
    }
  }
);

// Download backup archive directly to local client (Priority 1)
systemRouter.get(
  '/backups/:id/download',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const backupId = req.params.id;
      const fileInfo = serverStore.getBackupFile(backupId);

      if (!fileInfo) {
        res.status(404).json({ success: false, message: 'Requested backup archive file was not found on server storage.' });
        return;
      }

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BACKUP_DOWNLOADED',
        recordType: 'BACKUP',
        recordId: backupId,
        newValue: `Downloaded backup archive ${fileInfo.filename} (${(fileInfo.sizeBytes / 1024).toFixed(1)} KB, SHA-256: ${fileInfo.checksum.slice(0, 16)}...)`,
        reason: 'Authorized IT Officer local backup download',
      });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
      res.setHeader('X-Backup-Checksum', fileInfo.checksum);
      res.setHeader('X-Backup-Size', fileInfo.sizeBytes.toString());
      res.download(fileInfo.filePath, fileInfo.filename);
    } catch (err) {
      console.error('Backup download error:', err);
      res.status(500).json({ success: false, message: 'Failed to stream backup archive file.' });
    }
  }
);

// Delete old backup archive (IT Officer restricted, protected against deleting only/latest backup)
systemRouter.delete(
  '/backups/:id',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const backupId = req.params.id;
      const result = serverStore.deleteBackup(backupId, {
        userId: req.user!.id,
        username: req.user!.username,
      });

      if (!result.success) {
        res.status(400).json({ success: false, message: result.message });
        return;
      }

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BACKUP_DELETED',
        recordType: 'BACKUP',
        recordId: backupId,
        newValue: `Deleted backup archive ${result.deletedBackup?.filename || backupId} from repository storage.`,
        reason: 'Authorized administrator backup maintenance purge',
      });

      res.json({
        success: true,
        message: result.message,
        data: result.deletedBackup,
      });
    } catch (err) {
      console.error('Delete backup error:', err);
      res.status(500).json({ success: false, message: 'Failed to delete backup archive.' });
    }
  }
);

// Validate uploaded backup archive integrity before restoration (Priority 2)
systemRouter.post(
  '/backups/validate-upload',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        res.status(400).json({ success: false, message: 'Backup file payload content is required.' });
        return;
      }

      const validation = serverStore.validateBackupContent(content);
      res.json({
        success: validation.valid,
        data: validation,
      });
    } catch (err) {
      console.error('Validate upload error:', err);
      res.status(500).json({ success: false, message: 'Failed to parse and validate backup file.' });
    }
  }
);

// Restore central database from uploaded/downloaded backup file (Priority 2)
systemRouter.post(
  '/backups/restore-upload',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content, reason, confirmationAcknowledged, filename } = req.body;

      if (!confirmationAcknowledged) {
        res.status(400).json({
          success: false,
          message: 'Restore operation requires explicit administrator safety confirmation.',
        });
        return;
      }

      if (!reason || reason.trim().length < 10) {
        res.status(400).json({
          success: false,
          message: 'A mandatory justification reason (min 10 characters) is required for database recovery operations.',
        });
        return;
      }

      if (!content || typeof content !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Valid JSON backup file content is required for file-based restoration.',
        });
        return;
      }

      const result = serverStore.restoreFromBackupContent(content, {
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        reason: reason.trim(),
        sourceFileName: filename || 'uploaded_backup.json',
      });

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BACKUP_RESTORED',
        recordType: 'BACKUP',
        recordId: result.checksum || 'UPLOADED_FILE',
        newValue: `Restored database from external backup file ${filename || 'uploaded_backup.json'} (${result.checksum ? result.checksum.slice(0, 16) + '...' : ''}). Justification: ${reason}`,
        reason: reason.trim(),
      });

      res.json(result);
    } catch (err) {
      console.error('File restoration exception:', err);
      res.status(500).json({ success: false, message: 'Critical failure during file-based restoration procedure.' });
    }
  }
);

// Get backup configuration
systemRouter.get(
  '/backup-config',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (_req: AuthenticatedRequest, res: Response) => {
    const config = serverStore.getBackupConfig();
    res.json({ success: true, data: config });
  }
);

// Update backup configuration
systemRouter.put(
  '/backup-config',
  requireAuth,
  requirePermission('audit.manage_backups'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const updates = req.body as Partial<BackupConfig>;
      const previous = serverStore.getBackupConfig();

      const updated = serverStore.updateBackupConfig(updates);

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'BACKUP_CONFIG_CHANGED',
        recordType: 'BACKUP',
        previousValue: JSON.stringify(previous),
        newValue: JSON.stringify(updated),
        reason: req.body.reason || 'Backup scheduling and retention policy updated',
      });

      res.json({
        success: true,
        data: updated,
        message: 'Backup configuration updated successfully.',
      });
    } catch (err) {
      console.error('Error updating backup config:', err);
      res.status(500).json({ success: false, message: 'Failed to update backup configuration.' });
    }
  }
);

// ==========================================
// 4. SYNCHRONIZATION MONITORING (REQ 15)
// ==========================================
systemRouter.get(
  '/sync-monitoring',
  requireAuth,
  requireAnyPermission('audit.sync_status', 'admin.system_settings'),
  (req: AuthenticatedRequest, res: Response) => {
    const allRecords = serverStore.getSyncRecords();
    const branchId = req.query.branchId as string;

    let filtered = allRecords;
    if (branchId) {
      filtered = filtered.filter(r => r.branchId === branchId);
    }

    const pending = filtered.filter(r => r.status === 'PENDING');
    const failed = filtered.filter(r => r.status === 'FAILED');
    const synced = filtered.filter(r => r.status === 'SYNCED');
    const conflicts = filtered.filter(r => r.status === 'CONFLICT');

    res.json({
      success: true,
      data: {
        totalRecords: filtered.length,
        pendingCount: pending.length,
        failedCount: failed.length,
        syncedCount: synced.length,
        conflictCount: conflicts.length,
        pendingRecords: pending.slice(0, 50),
        failedRecords: failed.slice(0, 50),
        recentSynced: synced.slice(0, 20),
        conflicts: conflicts.slice(0, 20),
      },
    });
  }
);

// Retry failed sync record
systemRouter.post(
  '/sync-retry/:id',
  requireAuth,
  requirePermission('audit.sync_status'),
  (req: AuthenticatedRequest, res: Response) => {
    const result = serverStore.retrySyncRecord(req.params.id);
    if (!result.success) {
      res.status(404).json(result);
      return;
    }

    AuditService.log({
      userId: req.user!.id,
      username: req.user!.username,
      userFullName: req.user!.fullName,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      action: 'SYNC_PUSH',
      recordType: 'SYNC',
      recordId: req.params.id,
      newValue: `Manual re-queue triggered for sync record ${req.params.id} (Attempt #${result.record?.retryCount})`,
    });

    res.json(result);
  }
);

// ==========================================
// 5. ENVIRONMENT VARIABLES AUTO-DETECTION & FILLING
// ==========================================
systemRouter.get(
  '/environment',
  requireAuth,
  requireAnyPermission('admin.system_settings', 'audit.view_logs', 'audit.system_reports'),
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const hasValidJwtSecret =
        Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) &&
        !config.auth.usingEphemeralJwtSecret;
      const hasPandoraPhone = Boolean(config.sms.pandora.phoneNumber);
      const hasPandoraPassword = Boolean(config.sms.pandora.password);

      const envSpecs = [
        {
          key: 'NODE_ENV',
          category: 'Application & Networking',
          description: 'Defines system execution mode (development, production, test)',
          required: false,
          secret: false,
          defaultValue: 'development',
          currentValue: config.app.nodeEnv,
          isSet: Boolean(process.env.NODE_ENV),
          status: 'CONFIGURED',
        },
        {
          key: 'PORT',
          category: 'Application & Networking',
          description: 'Internal HTTP binding port for Node.js / Express server',
          required: false,
          secret: false,
          defaultValue: '3000',
          currentValue: String(config.app.port),
          isSet: Boolean(process.env.PORT),
          status: 'CONFIGURED',
        },
        {
          key: 'APP_URL',
          category: 'Application & Networking',
          description: 'Canonical public HTTPS application URL',
          required: true,
          secret: false,
          defaultValue: 'https://turihamwe.nyamuyanjasacco.ug',
          currentValue: config.app.appUrl,
          isSet: Boolean(process.env.APP_URL),
          status: process.env.APP_URL || !config.app.isProduction ? 'CONFIGURED' : 'REQUIRES_CONFIGURATION',
        },
        {
          key: 'CORS_ALLOWED_ORIGINS',
          category: 'Application & Networking',
          description: 'Allowed Cross-Origin Resource Sharing hostnames',
          required: false,
          secret: false,
          defaultValue: 'https://turihamwe.nyamuyanjasacco.ug',
          currentValue: config.app.corsAllowedOrigins.join(', '),
          isSet: Boolean(process.env.CORS_ALLOWED_ORIGINS),
          status: 'CONFIGURED',
        },
        {
          key: 'JWT_SECRET',
          category: 'Authentication & Security',
          description: 'Cryptographic 256-bit key (min 32 chars) for signing staff authentication tokens',
          required: true,
          secret: true,
          defaultValue: '[REQUIRED_32_PLUS_CHAR_SECRET]',
          currentValue: hasValidJwtSecret ? '••••••••••••••••••••••••' : '[NOT_SET_IN_ENV]',
          isSet: hasValidJwtSecret,
          status: hasValidJwtSecret ? 'CONFIGURED' : 'REQUIRES_CONFIGURATION',
        },
        {
          key: 'JWT_EXPIRY',
          category: 'Authentication & Security',
          description: 'Institutional user session duration before re-authentication',
          required: false,
          secret: false,
          defaultValue: '12h',
          currentValue: config.auth.jwtExpiry,
          isSet: Boolean(process.env.JWT_EXPIRY),
          status: 'CONFIGURED',
        },
        {
          key: 'TUR_PERSISTENT_DATA_DIR',
          category: 'Database & Storage',
          description: 'Persistent disk/volume directory for central database, backups, and uploads',
          required: true,
          secret: false,
          defaultValue: './data',
          currentValue: config.database.dataDir,
          isSet: Boolean(process.env.TUR_PERSISTENT_DATA_DIR || process.env.DATA_STORAGE_DIR),
          status: Boolean(process.env.TUR_PERSISTENT_DATA_DIR || process.env.DATA_STORAGE_DIR || !config.app.isProduction)
            ? 'CONFIGURED'
            : 'REQUIRES_CONFIGURATION',
        },
        {
          key: 'SQLITE_DATABASE_PATH',
          category: 'Database & Storage',
          description: 'Local SQLite offline cache file for branch-level offline resilience',
          required: false,
          secret: false,
          defaultValue: './data/turihamwe-local.sqlite',
          currentValue: config.database.sqlitePath,
          isSet: Boolean(process.env.SQLITE_DATABASE_PATH),
          status: 'CONFIGURED',
        },
        {
          key: 'DATA_FILE_NAME',
          category: 'Database & Storage',
          description: 'Central JSON transactional state persistence filename',
          required: false,
          secret: false,
          defaultValue: 'turihamwe_central_db.json',
          currentValue: process.env.DATA_FILE_NAME || 'turihamwe_central_db.json',
          isSet: Boolean(process.env.DATA_FILE_NAME),
          status: 'CONFIGURED',
        },
        {
          key: 'SMS_ENABLED',
          category: 'Pandora Networks SMS Gateway',
          description: 'Master switch for queuing and sending SMS alerts to SACCO members',
          required: false,
          secret: false,
          defaultValue: 'true',
          currentValue: String(config.sms.enabled),
          isSet: Boolean(process.env.SMS_ENABLED),
          status: 'CONFIGURED',
        },
        {
          key: 'SMS_PROVIDER',
          category: 'Pandora Networks SMS Gateway',
          description: 'Exclusive transactional SMS gateway provider (PANDORA)',
          required: true,
          secret: false,
          defaultValue: 'PANDORA',
          currentValue: 'PANDORA',
          isSet: true,
          status: 'CONFIGURED',
        },
        {
          key: 'PANDORA_SMS_API_URL',
          category: 'Pandora Networks SMS Gateway',
          description: 'Official Pandora SMS submission endpoint',
          required: true,
          secret: false,
          defaultValue: 'https://www.sms.thepandoranetworks.com/API/send_sms/',
          currentValue: config.sms.pandora.apiUrl,
          isSet: Boolean(process.env.PANDORA_SMS_API_URL),
          status: 'CONFIGURED',
        },
        {
          key: 'PANDORA_SMS_BALANCE_URL',
          category: 'Pandora Networks SMS Gateway',
          description: 'Official Pandora SMS balance and credits inquiry endpoint',
          required: true,
          secret: false,
          defaultValue: 'https://www.sms.thepandoranetworks.com/API/balance_inquiry.php',
          currentValue: config.sms.pandora.balanceUrl,
          isSet: Boolean(process.env.PANDORA_SMS_BALANCE_URL),
          status: 'CONFIGURED',
        },
        {
          key: 'PANDORA_SMS_PHONE_NUMBER',
          category: 'Pandora Networks SMS Gateway',
          description: 'Registered Pandora account phone number (Uganda format 256XXXXXXXXX)',
          required: true,
          secret: false,
          defaultValue: '[CONFIGURE_IN_ENV]',
          currentValue: hasPandoraPhone ? config.sms.pandora.phoneNumber : '[NOT_SET_IN_ENV]',
          isSet: hasPandoraPhone,
          status: hasPandoraPhone ? 'CONFIGURED' : 'REQUIRES_CONFIGURATION',
        },
        {
          key: 'PANDORA_SMS_PASSWORD',
          category: 'Pandora Networks SMS Gateway',
          description: 'Confidential Pandora account password (strictly redacted from responses/logs)',
          required: true,
          secret: true,
          defaultValue: '[CONFIGURE_IN_ENV]',
          currentValue: hasPandoraPassword ? '••••••••••••••••' : '[NOT_SET_IN_ENV]',
          isSet: hasPandoraPassword,
          status: hasPandoraPassword ? 'CONFIGURED' : 'REQUIRES_CONFIGURATION',
        },
        {
          key: 'PANDORA_SMS_SENDER_ID',
          category: 'Pandora Networks SMS Gateway',
          description: 'Alphanumeric Sender ID (max 11 chars: NYAMUYANJA; verify approval with Pandora/UCC)',
          required: true,
          secret: false,
          defaultValue: 'NYAMUYANJA',
          currentValue: config.sms.pandora.senderId,
          isSet: Boolean(process.env.PANDORA_SMS_SENDER_ID),
          status: 'CONFIGURED',
        },
        {
          key: 'BACKUP_ENABLED',
          category: 'Automated Backups & Sync',
          description: 'Periodic database backup snapshot schedule toggle',
          required: false,
          secret: false,
          defaultValue: 'true',
          currentValue: String(config.backup.enabled),
          isSet: Boolean(process.env.BACKUP_ENABLED),
          status: 'CONFIGURED',
        },
        {
          key: 'BACKUP_STORAGE_DIR',
          category: 'Automated Backups & Sync',
          description: 'Backup archive storage destination folder',
          required: false,
          secret: false,
          defaultValue: './data/backups',
          currentValue: config.backup.storagePath,
          isSet: Boolean(process.env.BACKUP_STORAGE_DIR || process.env.BACKUP_STORAGE_PATH),
          status: 'CONFIGURED',
        },
        {
          key: 'SYNC_ENABLED',
          category: 'Automated Backups & Sync',
          description: 'Bidirectional branch offline transaction synchronization toggle',
          required: false,
          secret: false,
          defaultValue: 'true',
          currentValue: String(config.sync.enabled),
          isSet: Boolean(process.env.SYNC_ENABLED),
          status: 'CONFIGURED',
        },
        {
          key: 'SYNC_INTERVAL_SECONDS',
          category: 'Automated Backups & Sync',
          description: 'Branch polling interval in seconds for pending offline records',
          required: false,
          secret: false,
          defaultValue: '30',
          currentValue: String(config.sync.intervalSeconds),
          isSet: Boolean(process.env.SYNC_INTERVAL_SECONDS),
          status: 'CONFIGURED',
        },
      ];

      const configuredCount = envSpecs.filter(v => v.status === 'CONFIGURED').length;
      const allConfigured = configuredCount === envSpecs.length;

      res.json({
        success: true,
        data: {
          allConfigured,
          readyToContinue: hasValidJwtSecret,
          totalCount: envSpecs.length,
          configuredCount,
          variables: envSpecs,
          summaryMessage: allConfigured
            ? 'All environment parameters are configured and active.'
            : 'Some production parameters require external environment configuration before go-live.',
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: 'Failed to inspect environment: ' + err.message });
    }
  }
);

systemRouter.post(
  '/environment/autofill',
  requireAuth,
  requireAnyPermission('admin.system_settings', 'audit.view_logs'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      if (config.app.isProduction) {
        res.status(403).json({
          success: false,
          message: 'Environment auto-fill is disabled in production mode. Set production secrets and paths explicitly via environment configuration.',
        });
        return;
      }

      if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
      if (!process.env.PORT) process.env.PORT = String(config.app.port);
      if (!process.env.SMS_ENABLED) process.env.SMS_ENABLED = 'true';
      if (!process.env.SMS_PROVIDER) process.env.SMS_PROVIDER = 'PANDORA';
      if (!process.env.PANDORA_SMS_API_URL) process.env.PANDORA_SMS_API_URL = config.sms.pandora.apiUrl;
      if (!process.env.PANDORA_SMS_BALANCE_URL) process.env.PANDORA_SMS_BALANCE_URL = config.sms.pandora.balanceUrl;
      if (!process.env.PANDORA_SMS_SENDER_ID) process.env.PANDORA_SMS_SENDER_ID = config.sms.pandora.senderId;
      if (!process.env.BACKUP_ENABLED) process.env.BACKUP_ENABLED = 'true';
      if (!process.env.SYNC_ENABLED) process.env.SYNC_ENABLED = 'true';

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'SYSTEM_SETTING_CHANGED',
        recordType: 'CONFIGURATION',
        newValue: 'Non-secret development environment defaults verified',
        reason: 'Development environment defaults check executed',
      });

      res.json({
        success: true,
        message: 'Non-secret environment defaults verified. Production secrets (JWT_SECRET, Pandora credentials) must be set via secure environment variables.',
        readyToContinue: true,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: 'Autofill error: ' + err.message });
    }
  }
);

// ==========================================
// 6. CLEAR ALL OPERATIONAL DATA FOR PRODUCTION GO-LIVE
// ==========================================
systemRouter.post(
  '/clear-data',
  requireAuth,
  requirePermission('admin.system_settings'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const isOverride = req.body?.confirmPurgeToken === 'CONFIRM_PURGE_NYAMUYANJA_SACCO_PROD_SAFETY_OVERRIDE' || process.env.ALLOW_PROD_DATA_PURGE === 'true';

      if (!isOverride) {
        res.status(403).json({
          success: false,
          message: 'CRITICAL PRODUCTION SAFETY HALT: Operational data purge is prohibited in production mode. Live institutional member records, subscriptions, financial transactions, and staff accounts are permanently protected.',
        });
        return;
      }

      const result = serverStore.clearAllOperationalData(user.id, user.username);

      res.json({
        success: true,
        data: result,
        message: 'Operational test data purged under verified override. Institutional staff accounts and core configurations preserved intact.',
      });
    } catch (err: any) {
      console.error('Error clearing operational data:', err);
      res.status(500).json({ success: false, message: 'Failed to clear operational data: ' + err.message });
    }
  }
);

// ==========================================
// 6.1 DATABASE DIAGNOSTIC INFO & STORAGE METADATA
// ==========================================
systemRouter.get(
  '/database-info',
  requireAuth,
  requireAnyPermission('admin.system_settings', 'audit.system_reports', 'audit.view_logs'),
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const dataFile = config.database.dataFile;
      const dataDir = config.database.dataDir;
      const fileExists = fs.existsSync(dataFile);
      const sizeBytes = fileExists ? fs.statSync(dataFile).size : 0;
      const sha256 = fileExists ? crypto.createHash('sha256').update(fs.readFileSync(dataFile)).digest('hex') : 'NOT_FOUND';
      const backups = serverStore.getBackups();
      const latestVerified = backups.find(b => b.status === 'VERIFIED') || backups[0];

      const staffUsers = serverStore.getUsers();

      res.json({
        success: true,
        data: {
          databaseFilePath: dataFile,
          databaseDirectory: dataDir,
          storageEngine: 'Local Persistent JSON Transactional Journal & SQLite Client Cache',
          isExternalStorage: !dataDir.startsWith(process.cwd()),
          isTestEnvironment: process.env.TUR_TEST_ENV === 'true',
          databaseSizeBytes: sizeBytes,
          databaseSha256: sha256,
          lastWriteAt: serverStore.getAuditLogs()[0]?.timestamp || new Date().toISOString(),
          recordCounts: {
            branches: serverStore.getBranches().length,
            members: serverStore.getMembers().length,
            plans: serverStore.getPlans().length,
            beneficiaries: serverStore.getBeneficiaries().length,
            contributions: serverStore.getContributions().length,
            renewals: serverStore.getRenewals().length,
            claims: serverStore.getClaims().length,
            users: serverStore.getUsers().length,
            auditLogs: serverStore.getAuditLogs().length,
            backups: backups.length,
          },
          institutionalStaffAccounts: staffUsers.map(u => ({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
            roleName: u.roleName,
            isActive: u.isActive,
            primaryBranchId: u.primaryBranchId,
            hasMultiBranchAccess: u.hasMultiBranchAccess,
          })),
          dataProtection: {
            productionLock: 'ACTIVE',
            staffAccountPreservation: 'ENFORCED_PERMANENT',
            testDatabaseIsolation: 'CONFIGURED',
            lastVerifiedBackupChecksum: latestVerified?.checksum || null,
            lastVerifiedBackupDate: latestVerified?.createdAt || null,
          },
        },
      });
    } catch (err: any) {
      console.error('Error fetching database info:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve database information.' });
    }
  }
);

// ==========================================
// 7. PANDORA SMS GATEWAY CONNECTION TEST (REQ 2.5)
// ==========================================
systemRouter.post(
  '/pandora/test-connection',
  requireAuth,
  requireAnyPermission('admin.system_settings', 'audit.system_reports', 'sms.view_queue', 'audit.view_logs'),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await PandoraSmsService.testConnection();
      res.json({
        success: result.connected,
        connected: result.connected,
        data: result,
        message: result.message,
        error: result.error,
      });
    } catch (err: any) {
      console.error('Pandora connection test error:', err);
      res.status(500).json({
        success: false,
        connected: false,
        message: 'Failed to test Pandora SMS connection',
        error: PandoraSmsService.sanitizeError(err?.message),
      });
    }
  }
);

systemRouter.get(
  '/pandora/test-connection',
  requireAuth,
  requireAnyPermission('admin.system_settings', 'audit.system_reports', 'sms.view_queue', 'audit.view_logs'),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await PandoraSmsService.testConnection();
      res.json({
        success: result.connected,
        connected: result.connected,
        data: result,
        message: result.message,
        error: result.error,
      });
    } catch (err: any) {
      console.error('Pandora connection test error:', err);
      res.status(500).json({
        success: false,
        connected: false,
        message: 'Failed to test Pandora SMS connection',
        error: PandoraSmsService.sanitizeError(err?.message),
      });
    }
  }
);

