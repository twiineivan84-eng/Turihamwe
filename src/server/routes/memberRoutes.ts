import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { SaccoMember, ControlledCorrection } from '../../types';
import { AuditService } from '../services/auditService';

export const memberRouter = Router();

// Validation helpers
function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^\+?[0-9]{9,15}$/.test(cleaned);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isWithinFiveDays(registrationDate: string): boolean {
  const reg = new Date(registrationDate.substring(0, 10)).getTime();
  const today = new Date(new Date().toISOString().substring(0, 10)).getTime();
  const diffDays = Math.round((today - reg) / (1000 * 60 * 60 * 24));
  return diffDays <= 5;
}

/**
 * GET /api/members
 * Search and list SACCO members.
 * CRITICAL RULE: Member search must support ONLY:
 * 1. SACCO account number
 * 2. Member name
 */
memberRouter.get(
  '/',
  requireAuth,
  requirePermission('members.view'),
  (req: AuthenticatedRequest, res: Response): void => {
    const { q, branchId } = req.query;
    const searchQuery = typeof q === 'string' ? q.trim() : undefined;
    const filterBranchId = typeof branchId === 'string' ? branchId : undefined;

    // Strict Branch Isolation (Phase 7 Requirement 7)
    let targetBranchId: string | undefined = filterBranchId;
    if (!req.user?.hasMultiBranchAccess) {
      targetBranchId = req.workingBranch?.id || req.user?.primaryBranchId;
    } else if (filterBranchId) {
      const allowed = new Set([req.user.primaryBranchId, ...(req.user.allowedBranchIds || [])]);
      if (!allowed.has(filterBranchId)) {
        res.status(403).json({ error: 'Forbidden: Access to records in the specified branch is not authorized.' });
        return;
      }
    }

    const members = serverStore.getMembers({
      searchQuery,
      branchId: targetBranchId,
    });

    // Populate branch names and 5-day lock status dynamically
    const enriched = members.map(m => {
      const branch = serverStore.getBranchById(m.branchId);
      const locked = !isWithinFiveDays(m.registrationDate);
      return {
        ...m,
        branchName: branch ? branch.name : m.branchName,
        isLockedFromNormalEdit: locked,
        turihamweStatus: m.turihamweStatus || 'UNREGISTERED',
      };
    });

    res.json({ success: true, data: enriched });
  }
);

/**
 * GET /api/members/:accountNumber
 * Retrieve a specific member profile with audit/correction history
 */
memberRouter.get(
  '/:accountNumber',
  requireAuth,
  requirePermission('members.view'),
  (req: AuthenticatedRequest, res: Response): void => {
    const accountNumber = req.params.accountNumber.trim().toUpperCase();
    const member = serverStore.getMemberByAccountNumber(accountNumber);

    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    const branch = serverStore.getBranchById(member.branchId);
    const locked = !isWithinFiveDays(member.registrationDate);
    const corrections = serverStore.getCorrectionsForMember(accountNumber);
    const auditLogs = serverStore.getAuditLogs({ limit: 50 }).filter(l => l.recordId === accountNumber);

    res.json({
      success: true,
      data: {
        ...member,
        branchName: branch ? branch.name : member.branchName,
        isLockedFromNormalEdit: locked,
        corrections,
        auditLogs,
      },
    });
  }
);

/**
 * POST /api/members
 * Register a new SACCO member.
 * - SACCO account number is the primary identifier.
 * - Must be unique across all members.
 * - If duplicate: "This SACCO account number is already registered."
 */
memberRouter.post(
  '/',
  requireAuth,
  requirePermission('members.register'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const body = req.body;

    // 1. Personal Information validation
    const saccoAccountNumber = (body.saccoAccountNumber || '').trim().toUpperCase();
    const fullName = (body.fullName || '').trim();
    const gender = body.gender;
    const dateOfBirth = (body.dateOfBirth || '').trim();
    const nationalIdNumber = (body.nationalIdNumber || '').trim().toUpperCase();

    if (!saccoAccountNumber) {
      res.status(400).json({ error: 'SACCO account number is required.' });
      return;
    }

    if (!fullName) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }

    if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      res.status(400).json({ error: 'Gender must be MALE, FEMALE, or OTHER.' });
      return;
    }

    if (!dateOfBirth) {
      res.status(400).json({ error: 'Date of birth is required.' });
      return;
    }

    const dobTime = new Date(dateOfBirth).getTime();
    if (isNaN(dobTime) || dobTime > Date.now()) {
      res.status(400).json({ error: 'Valid date of birth in the past is required.' });
      return;
    }

    if (!nationalIdNumber) {
      res.status(400).json({ error: 'National ID / identification number is required.' });
      return;
    }

    // 2. Contact Information validation
    const primaryPhone = (body.primaryPhone || '').trim();
    if (!primaryPhone) {
      res.status(400).json({ error: 'Primary phone number is required.' });
      return;
    }

    if (!isValidPhone(primaryPhone)) {
      res.status(400).json({ error: 'Primary phone number is invalid. Please enter a valid telephone number.' });
      return;
    }

    const alternativePhone = (body.alternativePhone || '').trim() || undefined;
    if (alternativePhone && !isValidPhone(alternativePhone)) {
      res.status(400).json({ error: 'Alternative phone number format is invalid.' });
      return;
    }

    const emailAddress = (body.emailAddress || '').trim().toLowerCase() || undefined;
    if (emailAddress && !isValidEmail(emailAddress)) {
      res.status(400).json({ error: 'Email address format is invalid.' });
      return;
    }

    // 3. Address validation
    const district = (body.district || '').trim();
    const subCounty = (body.subCounty || '').trim();
    const parish = (body.parish || '').trim();
    const village = (body.village || '').trim();

    if (!district || !subCounty || !parish || !village) {
      res.status(400).json({ error: 'Address fields (District, Sub-county, Parish, Village) are all required.' });
      return;
    }

    // 4. Branch Rule:
    // Single-branch users: Automatically use assigned/working branch.
    // Multi-branch users: Use branch selected in current working session, only allowed branches.
    let branchId = workingBranch.id;
    if (body.branchId && body.branchId !== workingBranch.id) {
      if (!user.hasMultiBranchAccess || !user.allowedBranchIds.includes(body.branchId)) {
        res.status(403).json({ error: 'Forbidden: Unauthorized branch selection.' });
        return;
      }
      branchId = body.branchId;
    }

    const targetBranch = serverStore.getBranchById(branchId);
    if (!targetBranch) {
      res.status(400).json({ error: 'Designated SACCO branch not found.' });
      return;
    }

    // 5. Account Number Rules:
    // Required, unique, belongs to only one member, never auto-generated, never changed, never duplicated.
    const existing = serverStore.getMemberByAccountNumber(saccoAccountNumber);
    if (existing) {
      // EXACT REQUIRED ERROR MESSAGE
      res.status(409).json({ error: 'This SACCO account number is already registered.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const registrationDate = body.registrationDate || nowIso.split('T')[0];

    const newMember: SaccoMember = {
      saccoAccountNumber,
      fullName,
      gender,
      dateOfBirth,
      nationalIdNumber,
      primaryPhone,
      alternativePhone,
      emailAddress,
      district,
      subCounty,
      parish,
      village,
      registrationDate,
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      createdById: user.id,
      createdByUsername: user.username,
      createdAt: nowIso,
      updatedAt: nowIso,
      isLockedFromNormalEdit: false,
      turihamweStatus: 'UNREGISTERED',
    };

    serverStore.addMember(newMember);

    // Audit log
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      action: 'MEMBER_CREATED',
      recordType: 'MEMBERS',
      recordId: saccoAccountNumber,
      newValue: `Registered member ${fullName} (A/C: ${saccoAccountNumber}) at ${targetBranch.name}`,
    });

    res.status(201).json({ success: true, data: newMember });
  }
);

/**
 * PUT /api/members/:accountNumber
 * Edit member information within the five-day rule.
 * During the first five days: Authorized users may edit permitted member information.
 * After five days: Normal editing must automatically become locked.
 * Returns: "Editing locked — record is older than 5 days."
 */
memberRouter.put(
  '/:accountNumber',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();

    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    // Branch Authorization: Admin must still obey branch/multi-branch boundaries
    if (!user.hasMultiBranchAccess) {
      const userBranchId = workingBranch?.id || user.primaryBranchId;
      if (member.branchId !== userBranchId) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to modify members in another branch.' });
        return;
      }
    } else {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      if (!allowed.has(member.branchId)) {
        res.status(403).json({ error: 'Forbidden: You do not have multi-branch access to this member\'s branch.' });
        return;
      }
    }

    // 5-DAY RULE ENFORCEMENT
    if (!isWithinFiveDays(member.registrationDate)) {
      // EXACT REQUIRED ERROR MESSAGE
      res.status(403).json({ error: 'Editing locked — record is older than 5 days.' });
      return;
    }

    const body = req.body;
    const updates: Partial<SaccoMember> = {};

    if (body.fullName !== undefined) updates.fullName = body.fullName.trim();
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.dateOfBirth !== undefined) updates.dateOfBirth = body.dateOfBirth;
    if (body.nationalIdNumber !== undefined) updates.nationalIdNumber = body.nationalIdNumber.trim().toUpperCase();

    if (body.primaryPhone !== undefined) {
      if (!isValidPhone(body.primaryPhone)) {
        res.status(400).json({ error: 'Primary phone number is invalid.' });
        return;
      }
      updates.primaryPhone = body.primaryPhone.trim();
    }

    if (body.alternativePhone !== undefined) {
      if (body.alternativePhone && !isValidPhone(body.alternativePhone)) {
        res.status(400).json({ error: 'Alternative phone number is invalid.' });
        return;
      }
      updates.alternativePhone = body.alternativePhone ? body.alternativePhone.trim() : undefined;
    }

    if (body.emailAddress !== undefined) {
      if (body.emailAddress && !isValidEmail(body.emailAddress)) {
        res.status(400).json({ error: 'Email address format is invalid.' });
        return;
      }
      updates.emailAddress = body.emailAddress ? body.emailAddress.trim().toLowerCase() : undefined;
    }

    if (body.district !== undefined) updates.district = body.district.trim();
    if (body.subCounty !== undefined) updates.subCounty = body.subCounty.trim();
    if (body.parish !== undefined) updates.parish = body.parish.trim();
    if (body.village !== undefined) updates.village = body.village.trim();

    // Account number cannot be changed
    delete (updates as Record<string, unknown>).saccoAccountNumber;
    delete (updates as Record<string, unknown>).registrationDate;
    delete (updates as Record<string, unknown>).branchId;

    const updated = serverStore.updateMember(accountNumber, updates);

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      action: 'MEMBER_EDITED',
      recordType: 'MEMBERS',
      recordId: accountNumber,
      previousValue: JSON.stringify(member),
      newValue: JSON.stringify(updated),
      reason: 'Normal edit within 5-day window',
    });

    res.json({ success: true, data: updated });
  }
);

/**
 * POST /api/members/:accountNumber/correction
 * Controlled correction mechanism for records older than 5 days.
 * Captures: User, Branch, Date/time, Member/account number, Field changed, Previous value, New value, Reason.
 */
memberRouter.post(
  '/:accountNumber/correction',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();

    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    // Branch Authorization: Admin must still obey branch/multi-branch boundaries
    if (!user.hasMultiBranchAccess) {
      const userBranchId = workingBranch?.id || user.primaryBranchId;
      if (member.branchId !== userBranchId) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to modify members in another branch.' });
        return;
      }
    } else {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      if (!allowed.has(member.branchId)) {
        res.status(403).json({ error: 'Forbidden: You do not have multi-branch access to this member\'s branch.' });
        return;
      }
    }

    const { fieldChanged, newValue, reason } = req.body;

    if (!fieldChanged || newValue === undefined || !reason || !reason.trim()) {
      res.status(400).json({
        error: 'Controlled correction requires fieldChanged, newValue, and a detailed institutional reason.',
      });
      return;
    }

    // Disallowed fields
    if (['saccoAccountNumber', 'registrationDate', 'createdById', 'createdAt'].includes(fieldChanged)) {
      res.status(400).json({ error: `Field '${fieldChanged}' is immutable and cannot be corrected.` });
      return;
    }

    const prevValue = String((member as unknown as Record<string, unknown>)[fieldChanged] ?? '');

    const correction: ControlledCorrection = {
      id: `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      saccoAccountNumber: accountNumber,
      userId: user.id,
      username: user.username,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      timestamp: new Date().toISOString(),
      fieldChanged,
      previousValue: prevValue,
      newValue: String(newValue).trim(),
      reason: reason.trim(),
    };

    serverStore.addCorrection(correction);

    // Apply change to member record
    const updated = serverStore.updateMember(accountNumber, {
      [fieldChanged]: String(newValue).trim(),
    });

    // Write to audit trail
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      action: 'MEMBER_CORRECTION',
      recordType: 'MEMBERS',
      recordId: accountNumber,
      previousValue: `${fieldChanged}: ${prevValue}`,
      newValue: `${fieldChanged}: ${String(newValue).trim()}`,
      reason: reason.trim(),
    });

    res.json({ success: true, data: updated, correction });
  }
);

/**
 * DELETE /api/members/:accountNumber
 * Admin-only member deletion / deactivation.
 * - Requires 'members.delete' permission.
 * - Enforces branch authorization boundaries.
 * - Checks referential dependencies (plans, contributions, renewals, claims).
 * - Implements safe soft-deletion / deactivation to preserve audit & historical records.
 * - Records full immutable audit log.
 */
memberRouter.delete(
  '/:accountNumber',
  requireAuth,
  requirePermission('members.delete'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();

    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    if (member.isDeleted) {
      res.status(400).json({ error: `Member with SACCO account number '${accountNumber}' is already deleted/deactivated.` });
      return;
    }

    // Branch Authorization: Admin must still obey branch/multi-branch boundaries
    if (!user.hasMultiBranchAccess) {
      const userBranchId = workingBranch?.id || user.primaryBranchId;
      if (member.branchId !== userBranchId) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to delete members in another branch.' });
        return;
      }
    } else {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      if (!allowed.has(member.branchId)) {
        res.status(403).json({ error: 'Forbidden: You do not have multi-branch access to this member\'s branch.' });
        return;
      }
    }

    const reason = (req.body?.reason || '').trim() || 'Administrative member record deletion';

    const result = serverStore.deleteMember(accountNumber, {
      userId: user.id,
      username: user.username,
      reason,
    });

    if (!result) {
      res.status(500).json({ error: 'Failed to delete member record.' });
      return;
    }

    // Log deletion in audit trail
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      action: 'MEMBER_DELETED',
      recordType: 'MEMBERS',
      recordId: accountNumber,
      previousValue: JSON.stringify({
        fullName: member.fullName,
        saccoAccountNumber: member.saccoAccountNumber,
        branchId: member.branchId,
        turihamweStatus: member.turihamweStatus,
      }),
      newValue: JSON.stringify({
        isDeleted: true,
        turihamweStatus: 'SUSPENDED',
        deletedByUserId: user.id,
        deletedByUsername: user.username,
        reason,
        preservedDependencies: result.dependencies,
      }),
      reason,
    });

    res.json({
      success: true,
      message: 'Member record successfully deleted / deactivated with referential integrity preserved.',
      data: result.member,
      dependencies: result.dependencies,
    });
  }
);

