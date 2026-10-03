import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import { SmsService } from '../services/smsService';
import { SmsTemplate, SmsMessage } from '../../types';

export const smsRouter = Router();

smsRouter.use(requireAuth);

// ==========================================
// 1. GET SMS TEMPLATES
// ==========================================
smsRouter.get('/templates', (req: AuthenticatedRequest, res: Response) => {
  const category = req.query.category as string | undefined;
  const branchId = req.workingBranch?.id;

  const templates = serverStore.getSmsTemplates({
    category,
    branchId: req.user?.hasMultiBranchAccess ? undefined : branchId,
  });

  res.json({ success: true, data: templates });
});

// ==========================================
// 2. CREATE SMS TEMPLATE
// ==========================================
smsRouter.post('/templates', requirePermission('sms.manage_templates'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { code, name, category, templateText, availableVariables } = req.body;

  if (!code || !name || !category || !templateText) {
    res.status(400).json({ success: false, error: 'code, name, category, and templateText are required' });
    return;
  }

  const newTemplate: SmsTemplate = {
    id: `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    code: code.toUpperCase().trim(),
    name: name.trim(),
    category,
    templateText: templateText.trim(),
    availableVariables: Array.isArray(availableVariables) ? availableVariables : ['[Member Name]', '[Expiry Date]', '[Branch]'],
    isActive: true,
    createdByUserId: user.id,
    createdByUserFullName: user.fullName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  serverStore.addSmsTemplate(newTemplate);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: req.workingBranch?.id || 'ALL',
    branchName: req.workingBranch?.name || 'Central Head Office',
    action: 'SMS_TEMPLATE_CREATED',
    recordType: 'SMS_TEMPLATE',
    recordId: newTemplate.id,
    newValue: JSON.stringify(newTemplate),
    reason: `Created SMS template '${newTemplate.name}'`,
  });

  res.status(201).json({ success: true, data: newTemplate });
});

// ==========================================
// 3. UPDATE SMS TEMPLATE
// ==========================================
smsRouter.put('/templates/:id', requirePermission('sms.manage_templates'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const template = serverStore.getSmsTemplateById(id);

  if (!template) {
    res.status(404).json({ success: false, error: 'Template not found' });
    return;
  }

  const { name, templateText, isActive, availableVariables } = req.body;
  const prev = JSON.stringify(template);

  if (name) template.name = name.trim();
  if (templateText) template.templateText = templateText.trim();
  if (isActive !== undefined) template.isActive = Boolean(isActive);
  if (Array.isArray(availableVariables)) template.availableVariables = availableVariables;

  template.updatedByUserId = user.id;
  template.updatedByUserFullName = user.fullName;
  template.updatedAt = new Date().toISOString();

  serverStore.updateSmsTemplate(template);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: req.workingBranch?.id || 'ALL',
    branchName: req.workingBranch?.name || 'Central Head Office',
    action: 'SMS_TEMPLATE_UPDATED',
    recordType: 'SMS_TEMPLATE',
    recordId: template.id,
    previousValue: prev,
    newValue: JSON.stringify(template),
    reason: `Updated SMS template '${template.name}'`,
  });

  res.json({ success: true, data: template });
});

// ==========================================
// 4. GET SMS QUEUE / LOGS
// ==========================================
smsRouter.get('/queue', requirePermission('sms.view_queue'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  const status = req.query.status as string | undefined;
  const searchQuery = req.query.searchQuery as string | undefined;
  const saccoAccountNumber = req.query.saccoAccountNumber as string | undefined;

  let branchId = req.query.branchId as string | undefined;
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const messages = serverStore.getSmsMessages({
    branchId: branchId || undefined,
    status: status || undefined,
    searchQuery: searchQuery || undefined,
    saccoAccountNumber: saccoAccountNumber || undefined,
  });

  res.json({ success: true, data: messages, total: messages.length });
});

// ==========================================
// 5. SEND / QUEUE INDIVIDUAL SMS
// ==========================================
smsRouter.post('/send', requirePermission('sms.send'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  if (!workingBranch) {
    res.status(400).json({ success: false, error: 'No active operating branch context' });
    return;
  }

  const {
    recipientPhone,
    recipientName,
    messageText,
    saccoAccountNumber,
    planId,
    claimId,
    eventReferenceKey,
    templateCategory,
    dispatchImmediately,
  } = req.body;

  if (!recipientPhone || !recipientName || !messageText) {
    res.status(400).json({ success: false, error: 'recipientPhone, recipientName, and messageText are required' });
    return;
  }

  const queueResult = SmsService.queueMessage({
    recipientPhone,
    recipientName,
    messageText,
    branchId: workingBranch.id,
    branchName: workingBranch.name,
    queuedByUserId: user.id,
    queuedByUserFullName: user.fullName,
    saccoAccountNumber,
    planId,
    claimId,
    eventReferenceKey,
    templateCategory,
  });

  if (queueResult.isDuplicate) {
    res.status(409).json({ success: false, error: queueResult.duplicateReason, isDuplicate: true });
    return;
  }

  const queued = queueResult.message!;

  if (dispatchImmediately) {
    const dispatchResult = await SmsService.dispatchMessage(queued.id);
    res.json({
      success: dispatchResult.success,
      data: dispatchResult.message,
      message: dispatchResult.success ? 'SMS dispatched successfully via Africa\'s Talking.' : `SMS queued with failure: ${dispatchResult.error}`,
    });
    return;
  }

  res.status(201).json({
    success: true,
    data: queued,
    message: 'SMS notification queued successfully for transmission.',
  });
});

// ==========================================
// 6. RETRY FAILED SMS
// ==========================================
smsRouter.post('/queue/:id/retry', requirePermission('sms.retry_failed'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const sms = serverStore.getSmsById(id);
  if (!sms) {
    res.status(404).json({ success: false, error: 'SMS record not found' });
    return;
  }

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: sms.branchId,
    branchName: sms.branchName,
    action: 'SMS_RETRIED',
    recordType: 'SMS',
    recordId: sms.id,
    reason: `Manual retry initiated by ${user.fullName}`,
  });

  const result = await SmsService.dispatchMessage(sms.id);
  res.json({
    success: result.success,
    data: result.message,
    message: result.success ? 'Message successfully dispatched upon retry.' : `Retry attempted: ${result.error}`,
  });
});

// ==========================================
// 7. BATCH PROCESS QUEUE
// ==========================================
smsRouter.post('/process-queue', requirePermission('sms.send'), async (_req: AuthenticatedRequest, res: Response) => {
  const result = await SmsService.processQueue();
  res.json({
    success: true,
    data: result,
    message: `Processed ${result.processed} queued messages: ${result.sent} sent, ${result.failed} failed.`,
  });
});

// ==========================================
// 8. GET NOTIFICATION EVENTS HISTORY
// ==========================================
smsRouter.get('/notifications', requirePermission('sms.view_notifications'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  let branchId = req.query.branchId as string | undefined;

  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const events = serverStore.getNotificationEvents({
    branchId: branchId || undefined,
    eventType: (req.query.eventType as string) || undefined,
  });

  res.json({ success: true, data: events, total: events.length });
});

// ==========================================
// 9. EVALUATE AUTOMATED EXPIRY EVENTS
// ==========================================
smsRouter.post('/evaluate-expiries', requirePermission('sms.configure_events'), (_req: AuthenticatedRequest, res: Response) => {
  const result = SmsService.evaluateExpiryNotificationEvents();
  res.json({
    success: true,
    data: result,
    message: `Evaluated policies: generated ${result.eventsCreated} notification events, queued ${result.messagesQueued} SMS messages.`,
  });
});
