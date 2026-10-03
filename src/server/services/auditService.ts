import crypto from 'crypto';
import { AuditAction, AuditLog } from '../../types';
import { serverStore } from '../storage/serverStore';

export interface RecordAuditParams {
  userId: string;
  username: string;
  userFullName: string;
  branchId: string;
  branchName: string;
  action: AuditAction;
  recordType: string;
  recordId?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  isSynced?: boolean;
}

export class AuditService {
  public static log(params: RecordAuditParams): AuditLog {
    const logEntry: AuditLog = {
      id: `aud-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      userId: params.userId,
      username: params.username,
      userFullName: params.userFullName,
      branchId: params.branchId,
      branchName: params.branchName,
      action: params.action,
      recordType: params.recordType,
      recordId: params.recordId,
      previousValue: params.previousValue,
      newValue: params.newValue,
      reason: params.reason,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      isSynced: params.isSynced ?? true,
    };

    serverStore.addAuditLog(logEntry);
    return logEntry;
  }

  public static getLogs(filter?: {
    branchId?: string;
    userId?: string;
    action?: string;
    recordType?: string;
    recordId?: string;
    startDate?: string;
    endDate?: string;
    searchQuery?: string;
    limit?: number;
  }): AuditLog[] {
    return serverStore.getAuditLogs(filter);
  }

  public static getLogById(id: string): AuditLog | undefined {
    return serverStore.getAuditLogById(id);
  }
}
