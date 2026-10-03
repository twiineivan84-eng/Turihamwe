import { Router, Response } from 'express';
import { requireAuth, requirePermission, requireAnyPermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import { BusinessRulesConfig, BackupConfig } from '../../types';

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
