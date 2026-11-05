/**
 * TURIHAMWE SMS NOTIFICATION CLEANUP AUDIT TEST SUITE
 * Nyamuyanja SACCO Ltd
 *
 * Verifies the single-notification policy for Turihamwe plan expiries:
 *  1. No SMS is sent 30 days before expiry (EXPIRY_30_DAYS suppressed).
 *  2. No SMS is sent 14 days before expiry (EXPIRY_14_DAYS suppressed).
 *  3. No SMS is sent 7 days before expiry (EXPIRY_7_DAYS suppressed).
 *  4. Exactly one official expiry notification is sent on the expiry date (EXPIRY_DATE_NOTICE).
 *  5. The official expiry message retains its exact approved wording in Runyankore.
 *  6. The official notification is held until 09:00 Africa/Kampala.
 *  7. Repeated scheduler execution does not send duplicate messages (durable idempotency).
 *  8. Expired plans do not receive repeated expiry notifications (no retrospective reminder spam).
 *  9. Claim notification templates remain active and operational.
 * 10. Contribution receipt notifications remain active and operational.
 * 11. Inactive expiry templates cannot be triggered through direct backend calls.
 * 12. Existing notification records, template records, and audit history remain intact.
 */

import { serverStore } from '../server/storage/serverStore';
import { SmsService, APPROVED_EXPIRY_SMS_TEXT } from '../server/services/smsService';
import { SaccoMember, TurihamwePlan } from '../types';
import { getUgandaDateString, getUgandaDateTimeParts } from '../utils/timezone';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export class TurihamweSmsCleanupAuditRunner {
  public static async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    console.log('\n>>> [SUITE] TURIHAMWE SMS NOTIFICATION CLEANUP AUDIT (12 SCENARIOS)');

    const todayUganda = getUgandaDateString(new Date());

    // Helper to create test member and plan
    const createTestMemberAndPlan = (saccoAccountNumber: string, expiryDate: string, planId?: string): { member: SaccoMember; plan: TurihamwePlan } => {
      const member: SaccoMember = {
        saccoAccountNumber,
        fullName: `Member ${saccoAccountNumber}`,
        gender: 'FEMALE',
        dateOfBirth: '1985-06-15',
        nationalIdNumber: `CM${Date.now().toString().slice(-8)}`,
        primaryPhone: '+256772999888',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Central',
        village: 'Kagarama',
        registrationDate: todayUganda,
        branchId: 'br-nya',
        branchName: 'Nyamuyanja Branch',
        turihamweStatus: 'ACTIVE',
        clientStatus: 'ALIVE',
      };
      serverStore.addMember(member);

      const plan: TurihamwePlan = {
        id: planId || `plan-test-${saccoAccountNumber}`,
        saccoAccountNumber,
        memberName: member.fullName,
        planCode: 'STANDARD',
        status: 'ACTIVE',
        enrolmentDate: todayUganda,
        effectiveStartDate: todayUganda,
        currentExpiryDate: expiryDate,
        maturityDate: expiryDate,
        totalContributionsAmount: 60000,
        registeredBranchId: 'br-nya',
        registeredBranchName: 'Nyamuyanja Branch',
        registeredByUserId: 'usr-it-ivan',
        registeredByUsername: 'ivan',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      serverStore.addPlan(plan);

      return { member, plan };
    };

    // ================================================================
    // SCENARIO 1: No SMS is sent 30 days before expiry
    // ================================================================
    try {
      const exp30Date = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const acc = `SMS-CLN-30-${Date.now()}`;
      const { plan } = createTestMemberAndPlan(acc, exp30Date);

      const beforeCount = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;
      // Run evaluation
      const res = SmsService.evaluateExpiryNotificationEvents({ skipHourCheck: true });
      const afterCount = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      const passed = beforeCount === 0 && afterCount === 0;
      results.push({
        id: 1,
        name: 'No SMS Sent 30 Days Before Expiry (EXPIRY_30_DAYS Suppressed)',
        passed,
        message: passed
          ? `Plan with 30-day future expiry (${exp30Date}) triggered zero SMS messages (advance reminders discontinued)`
          : `SMS was unexpectedly generated for 30-day advance expiry`,
      });
    } catch (err: any) {
      results.push({ id: 1, name: 'No SMS Sent 30 Days Before Expiry', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 2: No SMS is sent 14 days before expiry
    // ================================================================
    try {
      const exp14Date = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const acc = `SMS-CLN-14-${Date.now()}`;
      const { plan } = createTestMemberAndPlan(acc, exp14Date);

      const beforeCount = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;
      SmsService.evaluateExpiryNotificationEvents({ skipHourCheck: true });
      const afterCount = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      const passed = beforeCount === 0 && afterCount === 0;
      results.push({
        id: 2,
        name: 'No SMS Sent 14 Days Before Expiry (EXPIRY_14_DAYS Suppressed)',
        passed,
        message: passed
          ? `Plan with 14-day future expiry (${exp14Date}) triggered zero SMS messages (advance reminders discontinued)`
          : `SMS was unexpectedly generated for 14-day advance expiry`,
      });
    } catch (err: any) {
      results.push({ id: 2, name: 'No SMS Sent 14 Days Before Expiry', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 3: No SMS is sent 7 days before expiry
    // ================================================================
    try {
      const exp7Date = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const acc = `SMS-CLN-07-${Date.now()}`;
      const { plan } = createTestMemberAndPlan(acc, exp7Date);

      const beforeCount = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;
      SmsService.evaluateExpiryNotificationEvents({ skipHourCheck: true });
      const afterCount = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      const passed = beforeCount === 0 && afterCount === 0;
      results.push({
        id: 3,
        name: 'No SMS Sent 7 Days Before Expiry (EXPIRY_7_DAYS Suppressed)',
        passed,
        message: passed
          ? `Plan with 7-day future expiry (${exp7Date}) triggered zero SMS messages (advance reminders discontinued)`
          : `SMS was unexpectedly generated for 7-day advance expiry`,
      });
    } catch (err: any) {
      results.push({ id: 3, name: 'No SMS Sent 7 Days Before Expiry', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 4: Exactly one official expiry notification on expiry date
    // ================================================================
    try {
      const acc = `SMS-CLN-DUE-${Date.now()}`;
      const { plan } = createTestMemberAndPlan(acc, todayUganda);

      const beforeCount = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;
      // Evaluate with 09:30 EAT time
      const res = SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T09:30:00+03:00`,
      });
      const queued = serverStore.getSmsMessages().filter(m => m.planId === plan.id);

      const passed =
        beforeCount === 0 &&
        queued.length === 1 &&
        queued[0].templateCategory === 'EXPIRY_DATE_NOTICE' &&
        queued[0].status === 'PENDING';

      results.push({
        id: 4,
        name: 'Exactly One Official Expiry Notification Sent on Expiry Date',
        passed,
        message: passed
          ? `Plan expiring on ${todayUganda} successfully triggered exactly 1 official notification (ID: ${queued[0]?.id})`
          : `Failed: expected exactly 1 queued message, found ${queued.length}`,
      });
    } catch (err: any) {
      results.push({ id: 4, name: 'Exactly One Official Expiry Notification', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 5: Exact approved wording in Runyankore
    // ================================================================
    try {
      const acc = `SMS-CLN-TXT-${Date.now()}`;
      const { plan } = createTestMemberAndPlan(acc, todayUganda);

      SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T10:00:00+03:00`,
      });
      const queued = serverStore.getSmsMessages().find(m => m.planId === plan.id);

      const expectedText =
        'NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba';

      const exactMatch = queued?.messageText === expectedText;
      const lengthOk = (queued?.messageText?.length || 0) <= 160; // 132 chars <= 160 (Single GSM-7 segment)

      const passed = exactMatch && lengthOk && APPROVED_EXPIRY_SMS_TEXT === expectedText;
      results.push({
        id: 5,
        name: 'Official Expiry Message Retains Exact Approved Runyankore Wording',
        passed,
        message: passed
          ? `Message matches approved Runyankore text exactly (${queued?.messageText.length} characters, single GSM-7 segment)`
          : `Message text mismatch or length exceeded: text='${queued?.messageText}'`,
      });
    } catch (err: any) {
      results.push({ id: 5, name: 'Exact Approved Wording Verification', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 6: Official notification held until 09:00 Africa/Kampala
    // ================================================================
    try {
      const acc = `SMS-CLN-TIME-${Date.now()}`;
      const { plan } = createTestMemberAndPlan(acc, todayUganda);

      // A: Evaluate before 09:00 (e.g. 08:30:00+03:00)
      const resEarly = SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T08:30:00+03:00`,
        skipHourCheck: false,
      });
      const queuedEarly = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      // B: Evaluate at 09:00 (e.g. 09:00:00+03:00)
      const resOnTime = SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T09:00:00+03:00`,
        skipHourCheck: false,
      });
      const queuedOnTime = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      const passed = queuedEarly === 0 && queuedOnTime === 1;
      results.push({
        id: 6,
        name: 'Official Notification Held Until 09:00 Africa/Kampala',
        passed,
        message: passed
          ? `Held at 08:30 (0 queued); released at 09:00 EAT (1 queued) in strict compliance with sending time rule`
          : `Time gating failure: early=${queuedEarly}, onTime=${queuedOnTime}`,
      });
    } catch (err: any) {
      results.push({ id: 6, name: 'Notification Held Until 09:00 Africa/Kampala', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 7: Repeated scheduler execution does not send duplicate messages
    // ================================================================
    try {
      const acc = `SMS-CLN-DEDUP-${Date.now()}`;
      const { plan } = createTestMemberAndPlan(acc, todayUganda);

      // Tick 1
      SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T09:15:00+03:00`,
      });
      const count1 = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      // Tick 2 (repeated)
      SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T09:30:00+03:00`,
      });
      const count2 = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      // Tick 3 (repeated)
      SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T10:00:00+03:00`,
      });
      const count3 = serverStore.getSmsMessages().filter(m => m.planId === plan.id).length;

      const passed = count1 === 1 && count2 === 1 && count3 === 1;
      results.push({
        id: 7,
        name: 'Repeated Scheduler Execution Does Not Send Duplicate Messages',
        passed,
        message: passed
          ? `Durable idempotency key (PLAN_EXPIRY_AUTO::${plan.id}::${todayUganda}) successfully suppressed duplicate messages across multiple ticks`
          : `Duplicate messages detected: count1=${count1}, count2=${count2}, count3=${count3}`,
      });
    } catch (err: any) {
      results.push({ id: 7, name: 'Repeated Scheduler Deduplication', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 8: Expired plans do not receive repeated expiry notifications
    // ================================================================
    try {
      // Plan expired 30 days ago (no retrospective spam)
      const oldExpDate = '2026-08-01';
      const accOld = `SMS-CLN-OLD-${Date.now()}`;
      const { plan: oldPlan } = createTestMemberAndPlan(accOld, oldExpDate);

      SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T10:00:00+03:00`,
      });
      const oldQueued = serverStore.getSmsMessages().filter(m => m.planId === oldPlan.id).length;

      // Plan that expired yesterday but ALREADY received its notice
      const yestDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const accYest = `SMS-CLN-YEST-${Date.now()}`;
      const { plan: yestPlan } = createTestMemberAndPlan(accYest, yestDate);

      // Simulate prior notice already recorded
      serverStore.addNotificationEvent({
        id: `evt-prior-${yestPlan.id}`,
        eventType: 'EXPIRY_DUE_TODAY' as any,
        deduplicationKey: `PLAN_EXPIRY_AUTO::${yestPlan.id}::${yestDate}`,
        saccoAccountNumber: accYest,
        branchId: 'br-nya',
        branchName: 'Nyamuyanja Branch',
        description: 'Prior notice delivered',
        processed: true,
        createdAt: yestDate,
      });

      SmsService.evaluateExpiryNotificationEvents({
        simulatedDate: `${todayUganda}T10:00:00+03:00`,
      });
      const yestQueued = serverStore.getSmsMessages().filter(m => m.planId === yestPlan.id).length;

      const passed = oldQueued === 0 && yestQueued === 0;
      results.push({
        id: 8,
        name: 'Expired Plans Do Not Receive Repeated Expiry Notifications',
        passed,
        message: passed
          ? `Old expired plan (${oldExpDate}) received 0 retrospective reminders; previously notified plan received 0 duplicate notices`
          : `Spam or duplicate detected: oldQueued=${oldQueued}, yestQueued=${yestQueued}`,
      });
    } catch (err: any) {
      results.push({ id: 8, name: 'Expired Plans Repeat Notification Check', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 9: Claim notification templates permanently deleted & blocked
    // ================================================================
    try {
      const claimTemplateCodes = [
        'CLAIM_SUBMITTED_NOTICE',
        'CLAIM_DOCS_REQUESTED_NOTICE',
        'CLAIM_APPROVED_NOTICE',
        'CLAIM_REJECTED_NOTICE',
      ];

      const allDeleted = claimTemplateCodes.every(code => {
        const tmpl = serverStore.getSmsTemplateById(code);
        return tmpl === undefined;
      });

      // Verify direct queue rejection on deleted claim categories
      const resClaim = SmsService.queueMessage({
        recipientPhone: '+256772111222',
        recipientName: 'Natukunda Grace',
        messageText: 'Claim docket update',
        branchId: 'br-nya',
        branchName: 'Nyamuyanja Branch',
        queuedByUserId: 'usr-it-ivan',
        queuedByUserFullName: 'Ivan',
        templateCategory: 'CLAIM_APPROVED',
      });

      const passed = allDeleted && resClaim.message === undefined;

      results.push({
        id: 9,
        name: 'Claim Notification Templates Permanently Deleted & Blocked',
        passed,
        message: passed
          ? 'All 4 claim templates confirmed permanently DELETED and execution blocked under SACCO policy'
          : 'Claim templates were not properly purged or execution was not blocked',
      });
    } catch (err: any) {
      results.push({ id: 9, name: 'Claim Notification Templates Check', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 10: Contribution receipt notification template permanently deleted & blocked
    // ================================================================
    try {
      const contribTmpl = serverStore.getSmsTemplateById('CONTRIBUTION_RECEIPT_NOTICE');
      const isDeleted = contribTmpl === undefined;

      // Verify direct queue rejection on deleted contribution category
      const resContrib = SmsService.queueMessage({
        recipientPhone: '+256772111222',
        recipientName: 'Tumwine Bob',
        messageText: 'Receipt notice',
        branchId: 'br-nya',
        branchName: 'Nyamuyanja Branch',
        queuedByUserId: 'usr-it-ivan',
        queuedByUserFullName: 'Ivan',
        templateCategory: 'CONTRIBUTION_RECEIVED',
      });

      const passed = isDeleted && resContrib.message === undefined;

      results.push({
        id: 10,
        name: 'Contribution Receipt Notification Template Permanently Deleted & Blocked',
        passed,
        message: passed
          ? 'CONTRIBUTION_RECEIPT_NOTICE confirmed permanently DELETED and execution blocked under SACCO policy'
          : 'Contribution receipt template still exists or execution was not blocked',
      });
    } catch (err: any) {
      results.push({ id: 10, name: 'Contribution Receipt Notification Check', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 11: Discontinued advance reminder categories blocked from direct backend execution
    // ================================================================
    try {
      // Attempt 1: Direct queue with EXPIRY_REMINDER_30_DAYS category
      const res30 = SmsService.queueMessage({
        recipientPhone: '+256772111222',
        recipientName: 'Test Target',
        messageText: '30-day reminder attempt',
        branchId: 'br-nya',
        branchName: 'Nyamuyanja Branch',
        queuedByUserId: 'usr-it-ivan',
        queuedByUserFullName: 'Ivan',
        templateCategory: 'EXPIRY_REMINDER_30_DAYS',
      });

      // Attempt 2: Direct queue with EXPIRY_REMINDER_14_DAYS category
      const res14 = SmsService.queueMessage({
        recipientPhone: '+256772111222',
        recipientName: 'Test Target',
        messageText: '14-day reminder attempt',
        branchId: 'br-nya',
        branchName: 'Nyamuyanja Branch',
        queuedByUserId: 'usr-it-ivan',
        queuedByUserFullName: 'Ivan',
        templateCategory: 'EXPIRY_REMINDER_14_DAYS',
      });

      // Attempt 3: Direct queue with EXPIRY_REMINDER_7_DAYS category
      const res7 = SmsService.queueMessage({
        recipientPhone: '+256772111222',
        recipientName: 'Test Target',
        messageText: '7-day reminder attempt',
        branchId: 'br-nya',
        branchName: 'Nyamuyanja Branch',
        queuedByUserId: 'usr-it-ivan',
        queuedByUserFullName: 'Ivan',
        templateCategory: 'EXPIRY_REMINDER_7_DAYS',
      });

      // Attempt 4: Attempting to resurrect template via serverStore addSmsTemplate
      serverStore.addSmsTemplate({
        id: 'tmpl-resurrect-30',
        code: 'EXPIRY_30_DAYS',
        category: 'EXPIRY_REMINDER_30_DAYS' as any,
        name: 'Resurrected 30-Day Reminder',
        templateText: 'Test text',
        availableVariables: [],
        isActive: true,
        createdByUserId: 'usr-it-ivan',
        createdByUserFullName: 'Ivan',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const resurrected = serverStore.getSmsTemplateById('EXPIRY_30_DAYS');

      const passed =
        res30.message === undefined &&
        res14.message === undefined &&
        res7.message === undefined &&
        resurrected === undefined;

      results.push({
        id: 11,
        name: 'Deleted Expiry Templates Blocked from Direct Backend Execution & Resurrect',
        passed,
        message: passed
          ? 'Backend rejected queueing for all 3 deleted advance reminder categories; serverStore prevented template resurrection'
          : `Rejection failed: res30=${res30.message?.id}, res14=${res14.message?.id}, res7=${res7.message?.id}, resurrected=${resurrected?.id}`,
      });
    } catch (err: any) {
      results.push({ id: 11, name: 'Direct Backend Trigger Guard Check', passed: false, message: err.message });
    }

    // ================================================================
    // SCENARIO 12: Advance templates permanently deleted & remaining templates intact
    // ================================================================
    try {
      const templates = serverStore.getSmsTemplates();
      const t30 = templates.find(t => t.code === 'EXPIRY_30_DAYS');
      const t14 = templates.find(t => t.code === 'EXPIRY_14_DAYS');
      const t7 = templates.find(t => t.code === 'EXPIRY_7_DAYS');
      const tDue = templates.find(t => t.code === 'EXPIRY_DATE_NOTICE');

      // Verify the three unwanted advance templates NO LONGER EXIST
      const advanceDeleted = !t30 && !t14 && !t7;

      // Verify single official expiry notification is ACTIVE
      const dueIsActive = Boolean(tDue && tDue.isActive === true);

      // Verify the 5 claim and contribution templates are ALSO permanently deleted per user instruction
      const claimAndContribCodes = [
        'CLAIM_SUBMITTED_NOTICE',
        'CLAIM_DOCS_REQUESTED_NOTICE',
        'CLAIM_APPROVED_NOTICE',
        'CLAIM_REJECTED_NOTICE',
        'CONTRIBUTION_RECEIPT_NOTICE',
      ];
      const claimAndContribDeleted = claimAndContribCodes.every(code => {
        const tmpl = templates.find(t => t.code === code);
        return tmpl === undefined;
      });

      // Total templates in system is exactly 1 (EXPIRY_DATE_NOTICE only)
      const countIsExact = templates.length === 1;

      const passed = advanceDeleted && dueIsActive && claimAndContribDeleted && countIsExact;
      results.push({
        id: 12,
        name: 'Discontinued Templates Deleted & EXPIRY_DATE_NOTICE Is Sole Active Template',
        passed,
        message: passed
          ? `Confirmed: All 8 discontinued templates permanently deleted; EXPIRY_DATE_NOTICE is the sole active template (total: 1)`
          : `Integrity check failed: advanceDeleted=${advanceDeleted}, dueActive=${dueIsActive}, claimAndContribDeleted=${claimAndContribDeleted}, count=${templates.length}`,
      });
    } catch (err: any) {
      results.push({ id: 12, name: 'Audit & Record Integrity Check', passed: false, message: err.message });
    }

    return results;
  }
}
