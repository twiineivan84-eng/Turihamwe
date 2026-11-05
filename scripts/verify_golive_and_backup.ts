import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { serverStore } from '../src/server/storage/serverStore';

async function runVerification() {
  console.log('====================================================');
  console.log('TURIHAMWE MANAGEMENT SYSTEM — GO-LIVE FINAL VERIFICATION');
  console.log('====================================================\n');

  // Initialize server store
  await serverStore.initialize();

  const liveDbPath = path.resolve(process.cwd(), 'data/turihamwe_central_db.json');
  console.log(`[CHECK 1] Inspecting Live Central Database: ${liveDbPath}`);
  if (!fs.existsSync(liveDbPath)) {
    throw new Error(`Database file missing at ${liveDbPath}`);
  }

  const liveDbRaw = fs.readFileSync(liveDbPath, 'utf-8');
  const liveDb = JSON.parse(liveDbRaw);

  console.log(`- Database size: ${(Buffer.byteLength(liveDbRaw) / 1024).toFixed(2)} KB`);
  console.log(`- Users count: ${liveDb.users.length}`);
  console.log(`- Branches count: ${liveDb.branches.length}`);
  console.log(`- Roles count: ${liveDb.roles.length}`);
  console.log(`- Members count: ${liveDb.members.length}`);
  console.log(`- Plans count: ${liveDb.plans.length}`);
  console.log(`- Beneficiaries count: ${liveDb.beneficiaries.length}`);
  console.log(`- Contributions count: ${liveDb.contributions.length}`);
  console.log(`- Claims count: ${liveDb.claims.length}`);
  console.log(`- SMS Queue count: ${liveDb.smsQueue.length}`);
  console.log(`- System Alerts count: ${liveDb.systemAlerts?.length ?? 0}`);

  // Confirm ivan IT officer account
  const ivan = liveDb.users.find((u: any) => u.username === 'ivan');
  if (!ivan) {
    throw new Error('CRITICAL: Genuine ivan account is missing from database!');
  }
  console.log(`- Preserved Genuine User: username='${ivan.username}', role='${ivan.roleName}', branchId='${ivan.primaryBranchId}', multiBranch=${ivan.hasMultiBranchAccess}`);
  console.log(`- System Ready for Deployment: ${liveDb.systemSettings?.['deployment.ready']}`);

  console.log('\n[CHECK 2] Priority 1: Testing Local Backup Generation & Verification');
  const existingBackups = serverStore.getBackups();
  console.log(`- Existing verified backup snapshots: ${existingBackups.length}`);

  const res = serverStore.createBackup({
    userId: 'usr-it-ivan',
    username: 'ivan',
    userFullName: 'Ivan IT Officer',
    type: 'MANUAL',
    notes: 'Go-Live Verification Priority 1 Snapshot',
  });
  const backup = res.backup;
  console.log(`- Generated Backup snapshot: ID=${backup.id}, Filename=${backup.filename}`);
  console.log(`- Archive Size: ${(backup.sizeBytes / 1024).toFixed(2)} KB`);
  console.log(`- SHA-256 Checksum: ${backup.checksum}`);

  const backupFileInfo = serverStore.getBackupFile(backup.id);
  if (!backupFileInfo || !fs.existsSync(backupFileInfo.filePath)) {
    throw new Error('Backup file was not written to disk or getBackupFile failed!');
  }
  const fileContent = fs.readFileSync(backupFileInfo.filePath, 'utf-8');
  const computedHash = crypto.createHash('sha256').update(fileContent, 'utf-8').digest('hex');
  if (computedHash !== backup.checksum) {
    throw new Error(`Hash mismatch! Computed ${computedHash} !== Expected ${backup.checksum}`);
  }
  console.log(`- File integrity on disk verified: PASSED (SHA-256 match)`);

  console.log('\n[CHECK 3] Priority 2: Testing Validation of Downloaded Backup File');
  const validation = serverStore.validateBackupContent(fileContent);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  console.log(`- Backup content validation: PASSED`);
  console.log(`  * Manifest backup ID: ${validation.manifest?.backupId}`);
  console.log(`  * Manifest checksum match: ${validation.manifest?.checksumMatch}`);
  console.log(`  * Record counts in backup: Users=${validation.recordCounts?.users}, Members=${validation.recordCounts?.members}`);

  console.log('\n[CHECK 4] Priority 2: Testing Rejection of Corrupted / Invalid Backup Files');
  const corruptedContent = fileContent.replace('"branches"', '"corrupted_table"');
  const corruptedValidation = serverStore.validateBackupContent(corruptedContent);
  console.log(`- Tampered backup validation result: Valid=${corruptedValidation.valid}, Errors='${corruptedValidation.errors?.join(', ')}'`);
  if (corruptedValidation.valid) {
    throw new Error('Security failure: Corrupted backup file was accepted!');
  }
  const corruptedRes = serverStore.restoreFromBackupContent(corruptedContent, {
    userId: 'usr-it-ivan',
    username: 'ivan',
    userFullName: 'Ivan IT Officer',
    branchId: 'br-nyamuyanja',
    branchName: 'Nyamuyanja Branch',
    reason: 'Should be rejected',
  });
  if (corruptedRes.success) {
    throw new Error('Security failure: restoreFromBackupContent succeeded on corrupted content!');
  }
  console.log(`- Corrupted restore rejection verified: Correctly rejected with success=false ('${corruptedRes.message}')`);

  console.log('\n[CHECK 5] Checking Business Rules & Parameters Status:');
  const rules = serverStore.getBusinessRulesConfig();
  console.log(`- Registration fee: UGX ${rules.charges?.registrationFeeUGX?.toLocaleString()}`);
  console.log(`- Annual renewal fee: UGX ${rules.charges?.annualRenewalFeeUGX?.toLocaleString()}`);
  console.log(`- Post-lapse reactivation fee: UGX ${rules.charges?.postLapseReactivationFeeUGX?.toLocaleString()}`);
  console.log(`- Benefit amount: UGX ${rules.charges?.benefitAmountUGX?.toLocaleString()}`);
  console.log(`- Allowed frequencies: ${rules.contributionFrequency?.allowedFrequencies?.join(', ')}`);
  console.log(`- Cover duration: ${rules.renewalCoverPeriodMonths?.defaultMonths} months`);
  console.log(`- Grace notice: ${rules.gracePeriod?.noticeWindowDays} days notice, ${rules.gracePeriod?.lapsePeriodMonths} months lapse period`);
  console.log(`- SMS timing: ${rules.alertSchedule?.triggerEvent}`);
  console.log(`- SMS text: "${rules.alertSchedule?.approvedMessageText}"`);
  console.log(`- Max family members: ${rules.membershipLimits?.maxFamilyMembers}`);
  console.log(`- Max beneficiary age: ${rules.membershipLimits?.maxBeneficiaryAgeYears} years`);

  console.log('\n====================================================');
  console.log('ALL GO-LIVE VERIFICATION CHECKS COMPLETED SUCCESSFULLY');
  console.log('====================================================');
}

runVerification().catch(err => {
  console.error('\nVERIFICATION FAILED:', err);
  process.exit(1);
});
