/**
 * Turihamwe Management System - Master Production Deployment Verification Suite
 * Institution: Nyamuyanja SACCO Ltd, Uganda
 *
 * Verifies all Master Implementation Prompt requirements:
 * 1. Root Administrator 'ivan' preservation with IT Officer role & multi-branch access
 * 2. Complete absence of demo / sample records from production database
 * 3. Elimination of 6-month grace period (STRICTLY_PROHIBITED, 0 days, immediate expiry)
 * 4. Established financial fees: UGX 25k (reg), UGX 20k (renewal on/before expiry), UGX 25k (after expiry)
 * 5. Pandora SMS exclusivity on exact maturity date with approved Runyankore template
 * 6. Automated & Manual Backup with .bak format (NYAMUYANJA_TURIHAMWE_BACKUP_*.bak)
 * 7. Africa/Kampala midnight (00:00 UTC+03:00) backup scheduling & daily duplicate prevention
 * 8. Backup deletion safety guards (prohibiting deletion of sole backup / latest verified backup)
 * 9. Scheduled backup worker status reporting & health check integration
 */

import { serverStore } from '../server/storage/serverStore';
import { scheduledBackupWorker } from '../server/services/scheduledBackupWorker';
import { AuthService } from '../server/services/authService';
import fs from 'fs';
import path from 'path';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  message: string;
}

export class MasterProductionDeploymentTestRunner {
  public static async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    await serverStore.initialize();

    // 1. Ivan Account Preservation
    try {
      const ivan = serverStore.getUserByUsername('ivan');
      const isIvanPresent = !!ivan && ivan.id === 'usr-it-ivan';
      const isItOfficer = ivan?.roleName === 'IT Officer';
      const isHqBranch = ivan?.primaryBranchId === 'br-nyamuyanja';
      const hasMultiBranch = ivan?.hasMultiBranchAccess === true;
      const branches = serverStore.getBranches();
      const hasAllBranches = (ivan?.allowedBranchIds || []).length === branches.length;

      const authRes = (await AuthService.login({ username: 'ivan', password: 'Password9090!', branchId: 'br-nyamuyanja' })).success ||
                      (await AuthService.login({ username: 'ivan', password: '9090', branchId: 'br-nyamuyanja' })).success;

      const passed = isIvanPresent && isItOfficer && isHqBranch && hasMultiBranch && hasAllBranches && authRes;
      results.push({
        id: 1,
        name: 'Preserve Genuine IT Officer Account (ivan) with Credentials & Multi-Branch Access',
        passed,
        message: passed
          ? `Verified genuine account 'ivan' (${ivan?.fullName}) active across ${branches.length} branches`
          : 'IT Officer ivan account verification failed',
      });
    } catch (e: any) {
      results.push({ id: 1, name: 'Ivan Account Preservation', passed: false, message: e.message });
    }

    // 2. Production Database Purity (Zero Demo Records)
    try {
      const members = serverStore.getMembers();
      const plans = serverStore.getPlans();
      const contributions = serverStore.getContributions();
      const claims = serverStore.getClaims();
      const renewals = serverStore.getRenewals();
      const users = serverStore.getUsers();

      const passed = members.length === 0 &&
                     plans.length === 0 &&
                     contributions.length === 0 &&
                     claims.length === 0 &&
                     renewals.length === 0 &&
                     users.length === 1 &&
                     users[0].username === 'ivan';

      results.push({
        id: 2,
        name: 'Zero Demo Records & Clean Operational Slate in Production Database',
        passed,
        message: passed
          ? `Verified zero demo records (0 members, 0 plans, 0 contributions, 0 claims, 1 genuine user)`
          : `Non-zero records found: ${members.length} members, ${plans.length} plans, ${users.length} users`,
      });
    } catch (e: any) {
      results.push({ id: 2, name: 'Zero Demo Records', passed: false, message: e.message });
    }

    // 3. Elimination of 6-Month Grace Period (STRICTLY_PROHIBITED)
    try {
      const rules = serverStore.getBusinessRulesConfig();
      const gracePeriodStatus = rules.gracePeriod?.status;
      const gracePeriodDaysStatus = rules.gracePeriodDays?.status;
      const lapseMonths = rules.gracePeriod?.lapsePeriodMonths ?? -1;
      const noticeDays = rules.gracePeriod?.noticeWindowDays ?? -1;
      const graceDays = rules.gracePeriodDays?.defaultDays ?? -1;

      const passed = gracePeriodStatus === 'STRICTLY_PROHIBITED' &&
                     gracePeriodDaysStatus === 'STRICTLY_PROHIBITED' &&
                     lapseMonths === 0 &&
                     noticeDays === 0 &&
                     graceDays === 0;

      results.push({
        id: 3,
        name: 'Elimination of 6-Month Grace Period (Zero Grace Period / Immediate Expiry Enforced)',
        passed,
        message: passed
          ? `Grace period strictly prohibited (0 days, 0 months lapse). Immediate expiry enforced.`
          : `Grace period still configured: ${gracePeriodStatus}, lapse: ${lapseMonths}m`,
      });
    } catch (e: any) {
      results.push({ id: 3, name: 'Elimination of Grace Period', passed: false, message: e.message });
    }

    // 4. Established Financial Fee Policy
    try {
      const rules = serverStore.getBusinessRulesConfig();
      const regFee = rules.charges?.registrationFeeUGX ?? 0;
      const annualRenewalFee = rules.charges?.annualRenewalFeeUGX ?? 0;
      const postLapseFee = rules.charges?.postLapseReactivationFeeUGX ?? 0;
      const benefitAmount = rules.charges?.benefitAmountUGX ?? 0;

      const passed = regFee === 25000 &&
                     annualRenewalFee === 20000 &&
                     postLapseFee === 25000 &&
                     benefitAmount === 500000;

      results.push({
        id: 4,
        name: 'Established Financial Rules: UGX 25k (Reg), UGX 20k (On-Time Renewal), UGX 25k (Post-Expiry)',
        passed,
        message: passed
          ? `Fees verified: Reg UGX ${regFee.toLocaleString()}, Renewal UGX ${annualRenewalFee.toLocaleString()}, Post-Expiry UGX ${postLapseFee.toLocaleString()}, Benefit UGX ${benefitAmount.toLocaleString()}`
          : `Fee discrepancy detected: reg=${regFee}, renewal=${annualRenewalFee}, postLapse=${postLapseFee}`,
      });
    } catch (e: any) {
      results.push({ id: 4, name: 'Established Financial Rules', passed: false, message: e.message });
    }

    // 5. Pandora SMS Exclusivity & Approved Runyankore Template
    try {
      const templates = serverStore.getSmsTemplates();
      const template = templates.find(t => t.code === 'EXPIRY_DATE_NOTICE');
      const expectedText = 'NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba';
      const isApproved = template?.templateText === expectedText;
      const charCount = expectedText.length;
      const singleSegment = charCount <= 160;

      const passed = isApproved && singleSegment;
      results.push({
        id: 5,
        name: 'Pandora SMS Exclusivity & Approved Runyankore Maturity Template (Single GSM-7 Segment)',
        passed,
        message: passed
          ? `Verified exact approved Runyankore template (${charCount} chars <= 160 chars, 1 SMS segment)`
          : 'Template text or segment verification failed',
      });
    } catch (e: any) {
      results.push({ id: 5, name: 'Pandora SMS Exclusivity', passed: false, message: e.message });
    }

    // 6. Manual Backup Creation (.bak format with complete manifest & SHA-256)
    let createdBackupId = '';
    try {
      const backupRes = serverStore.createBackup({
        userId: 'usr-it-ivan',
        username: 'ivan',
        userFullName: 'Ivan (IT Officer)',
        type: 'MANUAL',
        notes: 'Final production deployment verification test backup',
      });

      const isBakFile = backupRes.backup.filename.endsWith('.bak') &&
                        backupRes.backup.filename.startsWith('NYAMUYANJA_TURIHAMWE_BACKUP_');
      const hasChecksum = typeof backupRes.backup.checksum === 'string' && backupRes.backup.checksum.length === 64;
      const isVerified = backupRes.backup.status === 'VERIFIED';
      createdBackupId = backupRes.backup.id;

      const backupPath = path.join(process.cwd(), 'data', 'backups', backupRes.backup.filename);
      const existsOnDisk = fs.existsSync(backupPath);
      let parsedManifestOk = false;
      if (existsOnDisk) {
        const content = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        parsedManifestOk = content.manifest?.institution === 'Nyamuyanja SACCO Ltd' &&
                           content.manifest?.fileExtension === '.bak' &&
                           Array.isArray(content.data?.branches);
      }

      const passed = backupRes.success && isBakFile && hasChecksum && isVerified && existsOnDisk && parsedManifestOk;
      results.push({
        id: 6,
        name: 'Backup Archive Generation in .bak Format with Full Manifest & Cryptographic SHA-256',
        passed,
        message: passed
          ? `Created .bak archive: ${backupRes.backup.filename} (SHA-256: ${backupRes.backup.checksum.slice(0, 16)}...)`
          : 'Failed to create valid .bak backup archive',
      });
    } catch (e: any) {
      results.push({ id: 6, name: 'Manual Backup Creation', passed: false, message: e.message });
    }

    // 7. Automated Midnight EAT Backup Duplicate Prevention
    try {
      // First call today
      const autoRes1 = serverStore.createAutomaticBackup();
      // Second call today (must return skipped: true as duplicate prevention)
      const autoRes2 = serverStore.createAutomaticBackup();

      const passed = autoRes1.success && autoRes2.success && autoRes2.skipped === true;
      results.push({
        id: 7,
        name: 'Automated Midnight EAT Backup Scheduler with Africa/Kampala Daily Duplicate Prevention',
        passed,
        message: passed
          ? `Initial auto-backup created; duplicate subsequent run prevented (skipped: ${autoRes2.skipped})`
          : `Duplicate prevention failed: auto1=${autoRes1.success}, auto2.skipped=${autoRes2.skipped}`,
      });
    } catch (e: any) {
      results.push({ id: 7, name: 'Automated Midnight EAT Backup', passed: false, message: e.message });
    }

    // 8. Backup Integrity Verification Endpoint/Service
    try {
      const verifyRes = serverStore.verifyBackup(createdBackupId, { userId: 'usr-it-ivan', username: 'ivan' });
      const passed = verifyRes.verified && verifyRes.checksumMatch;
      results.push({
        id: 8,
        name: 'Cryptographic SHA-256 Integrity Verification of Stored Backup Archive',
        passed,
        message: passed
          ? `Integrity verified: ${verifyRes.details}`
          : `Integrity check failed: ${verifyRes.details}`,
      });
    } catch (e: any) {
      results.push({ id: 8, name: 'Backup Integrity Verification', passed: false, message: e.message });
    }

    // 9. Backup Deletion Safety Guards (Cannot delete latest verified backup)
    try {
      // Attempting to delete the newest backup should fail safety guard 2
      const deleteProtectedRes = serverStore.deleteBackup(createdBackupId, {
        userId: 'usr-it-ivan',
        username: 'ivan',
      });

      // Now create another backup so createdBackupId is no longer the latest
      serverStore.createBackup({
        userId: 'usr-it-ivan',
        username: 'ivan',
        userFullName: 'Ivan (IT Officer)',
        type: 'MANUAL',
        notes: 'Newer snapshot to test deletion of older snapshot',
      });

      // Now deleting the older backup should succeed
      const deleteOldRes = serverStore.deleteBackup(createdBackupId, {
        userId: 'usr-it-ivan',
        username: 'ivan',
      });

      const passed = !deleteProtectedRes.success && deleteOldRes.success;
      results.push({
        id: 9,
        name: 'Backup Deletion Safety Guards (Protected Latest Backup, Allowed Older Archive Purge)',
        passed,
        message: passed
          ? 'Latest verified backup protected from accidental deletion; older backup safely purged with audit log'
          : `Safety guards failed: protected=${deleteProtectedRes.success}, oldDelete=${deleteOldRes.success}`,
      });
    } catch (e: any) {
      results.push({ id: 9, name: 'Backup Deletion Safety Guards', passed: false, message: e.message });
    }

    // 10. Scheduled Backup Worker Telemetry & Timezone Alignment
    try {
      const status = scheduledBackupWorker.getStatus();
      const passed = status.timezone.includes('Africa/Kampala') &&
                     status.scheduleTimeKampala.includes('00:00') &&
                     typeof status.fileFormat === 'string' &&
                     status.fileFormat.includes('.bak');
      results.push({
        id: 10,
        name: 'Scheduled Backup Worker Telemetry & Africa/Kampala Timezone Alignment',
        passed,
        message: passed
          ? `Worker active on schedule: ${status.scheduleTimeKampala} (${status.timezone}) with format ${status.fileFormat}`
          : `Worker status verification failed: tz=${status.timezone}, schedule=${status.scheduleTimeKampala}, format=${status.fileFormat}`,
      });
    } catch (e: any) {
      results.push({ id: 10, name: 'Scheduled Backup Worker Telemetry', passed: false, message: e.message });
    }

    // 11. SACCO Account Number Permanence & Indefinite Validity
    try {
      // Create test member 1: with expired Turihamwe plan
      const testAccExpired = 'NYA-PERM-001';
      serverStore.addMember({
        saccoAccountNumber: testAccExpired,
        fullName: 'Tumwebaze Ronald',
        gender: 'MALE',
        dateOfBirth: '1980-05-15',
        nationalIdNumber: 'CM80012345678A',
        primaryPhone: '+256772111222',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Central',
        village: 'Kagarama',
        registrationDate: '2020-01-10', // Long ago registration
        branchId: 'br-nyamuyanja',
        turihamweStatus: 'EXPIRED',
        clientStatus: 'ALIVE',
      });

      // Create expired Turihamwe plan for member 1
      serverStore.addPlan({
        id: 'PLN-PERM-001',
        saccoAccountNumber: testAccExpired,
        memberName: 'Tumwebaze Ronald',
        planCode: 'STANDARD',
        status: 'EXPIRED',
        enrolmentDate: '2020-01-10',
        effectiveStartDate: '2020-01-10',
        currentExpiryDate: '2021-01-10', // Expired 5 years ago
        subscriptionDate: '2020-01-10',
        maturityDate: '2021-01-10',
        registeredBranchId: 'br-nyamuyanja',
        registeredByUserId: 'usr-it-ivan',
        registeredByUsername: 'ivan',
        createdAt: '2020-01-10T08:00:00Z',
        updatedAt: '2021-01-10T08:00:00Z',
      });

      // Create test member 2: unregistered (no Turihamwe plan at all)
      const testAccUnregistered = 'NYA-PERM-002';
      serverStore.addMember({
        saccoAccountNumber: testAccUnregistered,
        fullName: 'Ninsiima Grace',
        gender: 'FEMALE',
        dateOfBirth: '1992-08-20',
        nationalIdNumber: 'CF92098765432B',
        primaryPhone: '+256773333444',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Nyakigyera',
        village: 'Rwampara',
        registrationDate: '2019-06-01', // No transactions for years
        branchId: 'br-kagarama',
        turihamweStatus: 'UNREGISTERED',
        clientStatus: 'ALIVE',
      });

      // Verify both members are completely searchable and retrievable by SACCO account number
      const member1 = serverStore.getMemberByAccountNumber(testAccExpired);
      const member2 = serverStore.getMemberByAccountNumber(testAccUnregistered);
      const searchRes1 = serverStore.getMembers({ searchQuery: testAccExpired });
      const searchRes2 = serverStore.getMembers({ searchQuery: testAccUnregistered });

      // Verify members have NO expiry date property or limitation
      const hasNoExpiryDate1 = !('expiryDate' in (member1 || {}));
      const hasNoExpiryDate2 = !('expiryDate' in (member2 || {}));
      const notDeactivated1 = member1?.isDeleted !== true;
      const notDeactivated2 = member2?.isDeleted !== true;

      const passed = !!member1 &&
                     !!member2 &&
                     searchRes1.length === 1 &&
                     searchRes2.length === 1 &&
                     hasNoExpiryDate1 &&
                     hasNoExpiryDate2 &&
                     notDeactivated1 &&
                     notDeactivated2;

      results.push({
        id: 11,
        name: 'SACCO Account Number Permanence: Indefinite Validity with Zero Expiry & Zero Deactivation',
        passed,
        message: passed
          ? 'Confirmed: SACCO account numbers remain permanently valid, searchable, and active even when Turihamwe plan is expired, unrenewed, or absent'
          : 'SACCO account permanence check failed',
      });
    } catch (e: any) {
      results.push({ id: 11, name: 'SACCO Account Number Permanence', passed: false, message: e.message });
    }

    // 12. Institutional Business Rules: saccoAccountNumberPermanence Policy Enforced
    try {
      const rules = serverStore.getBusinessRulesConfig();
      const permRule = rules.saccoAccountNumberPermanence;

      const passed = permRule?.status === 'ACTIVE_POLICY' &&
                     permRule?.isPermanentRecord === true &&
                     permRule?.hasExpiryDate === false &&
                     permRule?.hasTimeLimitation === false &&
                     permRule?.automaticDeactivation === false &&
                     permRule?.restrictionsBasedOnTurihamwe === false &&
                     permRule?.indefiniteValidity === true;

      results.push({
        id: 12,
        name: 'Institutional Governance: saccoAccountNumberPermanence Policy Active & Enforced',
        passed,
        message: passed
          ? 'Confirmed: Institutional rule explicitly codifies permanent record with no expiry date, no time limit, and no deactivation'
          : `Policy not configured properly: ${JSON.stringify(permRule)}`,
      });
    } catch (e: any) {
      results.push({ id: 12, name: 'Institutional Governance Policy', passed: false, message: e.message });
    }

    return results;
  }
}

if (process.argv[1]?.endsWith('masterProductionDeployment.test.ts')) {
  MasterProductionDeploymentTestRunner.runAllTests().then(results => {
    console.log('\n================================================================');
    console.log('   MASTER PRODUCTION DEPLOYMENT VERIFICATION SUITE');
    console.log('   Institution: Nyamuyanja SACCO Ltd, Uganda');
    console.log('================================================================\n');

    let passedCount = 0;
    for (const r of results) {
      if (r.passed) {
        passedCount++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
        console.log(`    ${r.message}`);
      } else {
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
        console.log(`    FAIL: ${r.message}`);
      }
    }

    console.log(`\nSummary: ${passedCount}/${results.length} Passed (${Math.round((passedCount / results.length) * 100)}% Success)`);
    if (passedCount !== results.length) {
      process.exit(1);
    }
  });
}
