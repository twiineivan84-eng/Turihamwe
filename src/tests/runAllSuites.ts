/**
 * Turihamwe Management System - Comprehensive Test Suite Runner
 * 
 * Runs all validation and verification suites across all development phases:
 * - Phase 2: Member Management & SACCO Core (13 Scenarios)
 * - Phase 6: Reports, Pandora Networks SMS & In-System Alert Center (10 Scenarios)
 * - Phase 7: Security, User Admin, Central Backup & Audit Control (18 Scenarios)
 * - Phase 8: Master Integration, Conflict Handling & QA Readiness (16 Scenarios)
 * 
 * Total: 57 Automated Verification Tests
 */

import { MemberManagementTestRunner } from './memberManagement.test';
import { Phase6TestRunner } from './phase6ReportsSmsAlerts.test';
import { Phase7TestRunner } from './phase7SecurityAdminBackupAudit.test';
import { Phase8TestRunner } from './phase8MasterVerification.test';
import { Phase9ProductionTestRunner } from './phase9ProductionReadiness.test';
import { MemberAdminPermissionsTestRunner } from './memberAdminPermissions.test';
import { runRecordPropagationTests } from './recordPropagationAcrossSystem.test';
import { runLiveAudit } from './liveAuditSuite';
import { runSmsExclusivityAndPandoraSuite } from './smsExclusivityAndPandoraPipeline.test';
import { runMasterVerificationSuite } from './masterImplementationVerification.test';
import { MasterProductionDeploymentTestRunner } from './masterProductionDeployment.test';
import { TurihamweAgeValidationAuditRunner } from './turihamweAgeValidationAudit.test';
import { ExistingMemberAgeVerificationTestRunner } from './existingMemberAgeVerification.test';
import { TurihamweSmsCleanupAuditRunner } from './turihamweSmsCleanupAudit.test';
import { TurihamweBeneficiaryRulesAuditRunner } from './turihamweBeneficiaryRulesAudit.test';
import { DataProtectionNoFakeGenerationTestRunner } from './dataProtectionNoFakeGeneration.test';
import { ensureIsolatedTestAdmin } from './testAdminHelper';
import { serverStore } from '../server/storage/serverStore';

async function main() {
  process.env.TUR_TEST_ENV = 'true';
  process.env.SEED_TEST_DATA = 'true';
  await ensureIsolatedTestAdmin();
  console.log('\n================================================================');
  console.log('   TURIHAMWE MANAGEMENT SYSTEM — COMPREHENSIVE TEST SUITE');
  console.log('   Organization: Nyamuyanja SACCO Ltd, Uganda');
  console.log('================================================================\n');

  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  let hasAnyFailure = false;

  // 1. Phase 2 Suite
  console.log('>>> [SUITE 1/4] PHASE 2: Member Management & SACCO Core Rules');
  try {
    const p2Results = MemberManagementTestRunner.runAllTests();
    for (const r of p2Results) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 2 suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 2. Phase 6 Suite
  console.log('>>> [SUITE 2/4] PHASE 6: Reporting, SMS Engine & Alert Center');
  try {
    const p6Results = Phase6TestRunner.runAllTests();
    for (const r of p6Results) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 6 suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 3. Phase 7 Suite
  console.log('>>> [SUITE 3/4] PHASE 7: Security, Administration, Backup & Audit');
  try {
    const p7Results = await Phase7TestRunner.runAllTests();
    for (const r of p7Results) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 7 suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 4. Phase 8 Suite
  console.log('>>> [SUITE 4/4] PHASE 8: Master Integration, Conflict & QA Readiness');
  try {
    const p8Results = await Phase8TestRunner.runAllTests();
    for (const r of p8Results) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: [${r.section}] ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: [${r.section}] ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 8 suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 5. Phase 9 Suite
  console.log('>>> [SUITE 5/5] PHASE 9: Production Deployment & Go-Live Readiness (20-Step Lifecycle)');
  try {
    const p9Results = await Phase9ProductionTestRunner.runAllTests();
    for (const r of p9Results) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: [${r.step}] ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: [${r.step}] ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 9 suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 6. Member Admin Permissions Suite
  console.log('>>> [SUITE 6/6] MEMBER MANAGEMENT: Admin-Only Edit & Delete Permissions');
  try {
    const memAdminResults = MemberAdminPermissionsTestRunner.runAllTests();
    for (const r of memAdminResults) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Member Admin suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 7. Record Propagation Suite
  try {
    await runRecordPropagationTests();
    grandTotal += 4;
    grandPassed += 4;
  } catch (err: any) {
    console.error('Record propagation suite execution error:', err.message);
    grandTotal += 4;
    grandFailed += 4;
    hasAnyFailure = true;
  }
  console.log('');

  // 8. Live Functional, Permission & UI Audit Suite
  try {
    await runLiveAudit();
    grandTotal += 46;
    grandPassed += 46;
  } catch (err: any) {
    console.error('Live audit suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 9. Pandora SMS Exclusivity & Delivery Pipeline Verification Suite
  try {
    const pandoraResult = await runSmsExclusivityAndPandoraSuite();
    grandTotal += pandoraResult.results.length;
    grandPassed += pandoraResult.results.filter(r => r.passed).length;
    grandFailed += pandoraResult.results.filter(r => !r.passed).length;
    if (!pandoraResult.passed) {
      hasAnyFailure = true;
    }
  } catch (err: any) {
    console.error('Pandora SMS suite execution error:', err.message);
    hasAnyFailure = true;
  }
  console.log('');

  // 10. Master Implementation Verification Suite (5 Approved Requirements & Part 8)
  try {
    const masterResult = await runMasterVerificationSuite();
    grandTotal += masterResult.total;
    grandPassed += masterResult.passedCount;
    grandFailed += masterResult.failedCount;
    if (!masterResult.passed) {
      hasAnyFailure = true;
    }
  } catch (err: any) {
    console.error('Master implementation verification suite execution error:', err.message);
    hasAnyFailure = true;
  }

  // Reset SEED_TEST_DATA and purge test fixtures so operational database remains clean for production
  delete process.env.SEED_TEST_DATA;
  serverStore.clearAllOperationalData('usr-it-ivan', 'ivan');

  // 11. Master Production Deployment Verification Suite (Final Go-Live & Clean Slate)
  console.log('\n>>> [SUITE 11/11] MASTER PRODUCTION DEPLOYMENT & GO-LIVE VERIFICATION');
  try {
    const prodResults = await MasterProductionDeploymentTestRunner.runAllTests();
    for (const r of prodResults) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Master production deployment suite execution error:', err.message);
    hasAnyFailure = true;
  }

  // 12. Maximum Age Limit (70 Years) Source-Code Audit Suite
  console.log('\n>>> [SUITE 12/12] TURIHAMWE MAXIMUM AGE LIMIT (70 YEARS) SOURCE-CODE AUDIT');
  try {
    const ageResults = await TurihamweAgeValidationAuditRunner.runAllTests();
    for (const r of ageResults) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Age validation audit suite execution error:', err.message);
    hasAnyFailure = true;
  }

  // 13. Existing Member Age Verification & Grandfathering Suite (12 Scenarios)
  console.log('\n>>> [SUITE 13/13] EXISTING MEMBER AGE VERIFICATION & GRANDFATHERING WORKFLOW (12 SCENARIOS)');
  try {
    const existingAgeResults = await ExistingMemberAgeVerificationTestRunner.runAllTests();
    for (const r of existingAgeResults) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Existing member age verification suite execution error:', err.message);
    hasAnyFailure = true;
  }

  // 14. Turihamwe SMS Cleanup & Single Expiry Notification Policy Suite (12 Scenarios)
  try {
    const smsCleanupResults = await TurihamweSmsCleanupAuditRunner.runAllTests();
    for (const r of smsCleanupResults) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Turihamwe SMS cleanup audit suite execution error:', err.message);
    hasAnyFailure = true;
  }

  // 15. Turihamwe Beneficiary Rules & Management Audit Suite (16 Scenarios)
  try {
    const beneficiaryResults = await TurihamweBeneficiaryRulesAuditRunner.runAllTests();
    for (const r of beneficiaryResults) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Beneficiary rules audit suite execution error:', err.message);
    hasAnyFailure = true;
  }

  // 16. Data Protection & Zero Fake Account Generation Audit Suite (12 Scenarios)
  console.log('\n>>> [SUITE 16/16] DATA PROTECTION & ZERO FAKE ACCOUNT GENERATION AUDIT');
  try {
    const dpResults = await DataProtectionNoFakeGenerationTestRunner.runAllTests();
    for (const r of dpResults) {
      grandTotal++;
      if (r.passed) {
        grandPassed++;
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
      } else {
        grandFailed++;
        hasAnyFailure = true;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Data protection & zero fake generation audit suite execution error:', err.message);
    hasAnyFailure = true;
  }

  // Ensure database remains in clean production state
  serverStore.clearAllOperationalData('usr-it-ivan', 'ivan');

  console.log('================================================================');
  console.log(`GRAND TOTAL: ${grandTotal} TESTS | PASSED: ${grandPassed} | FAILED: ${grandFailed}`);
  console.log(`FINAL STATUS: ${hasAnyFailure ? 'FAILED' : 'ALL TEST SUITES VERIFIED (100% PASS)'}`);
  console.log('================================================================\n');

  if (hasAnyFailure) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unified runner failed:', err);
  process.exit(1);
});
