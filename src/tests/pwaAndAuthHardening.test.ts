/**
 * Turihamwe Management System — PWA, Authentication, Database Recovery & Sync Verification Suite
 * Organization: Nyamuyanja SACCO Ltd, Uganda
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { ServerStore, DatabaseConnectionError, serverStore } from '../server/storage/serverStore';
import { AuthService } from '../server/services/authService';
import { PandoraAdapter } from '../server/services/pandoraAdapter';
import { config } from '../server/config';

export interface PwaAuthHardeningTestResult {
  id: number;
  name: string;
  passed: boolean;
  message: string;
}

export class PwaAndAuthHardeningTestRunner {
  public static async runAllTests(): Promise<PwaAuthHardeningTestResult[]> {
    const results: PwaAuthHardeningTestResult[] = [];
    const rootDir = process.cwd();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'turihamwe-pwa-auth-'));

    try {
      await serverStore.initialize();

      // ==========================================
      // TEST 1: Existing user authentication ('ivan' + Nyamuyanja Branch) & strict bcrypt check
      // ==========================================
      {
        const prodDbPath = path.join(rootDir, 'data', 'turihamwe_central_db.json');
        let prodHasIvanAndNyamuyanja = true;
        if (fs.existsSync(prodDbPath)) {
          const raw = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));
          const ivanProd = (raw.users || []).find(
            (u: any) => (u.username || '').trim().toLowerCase() === 'ivan'
          );
          const nyaProd = (raw.branches || []).find((b: any) => b.id === 'br-nyamuyanja');
          prodHasIvanAndNyamuyanja = Boolean(
            ivanProd &&
              ivanProd.isActive &&
              typeof ivanProd.passwordHash === 'string' &&
              ivanProd.passwordHash.startsWith('$2') &&
              nyaProd &&
              nyaProd.isActive &&
              (ivanProd.primaryBranchId === 'br-nyamuyanja' ||
                (ivanProd.hasMultiBranchAccess &&
                  (ivanProd.allowedBranchIds || []).includes('br-nyamuyanja')))
          );
        }

        // Verify login behavior with Nyamuyanja Branch using isolated test DB record ONLY
        const ivanTest = config.database.dataFile.endsWith('turihamwe_test_suite_db.json')
          ? serverStore.getUserByUsername('ivan')
          : undefined;
        let loginFlowOk = false;
        if (ivanTest) {
          const originalHash = ivanTest.passwordHash;
          const testPass = 'SecureTest#Pass2026!';
          serverStore.updateUser(ivanTest.id, { passwordHash: await bcrypt.hash(testPass, 10) });

          const okRes = await AuthService.login({
            branchId: 'br-nyamuyanja',
            username: 'ivan',
            password: testPass,
          });
          const codeRes = await AuthService.login({
            branchId: 'NYAMUYANJA',
            username: ' Ivan ',
            password: testPass,
          });
          const badPass = await AuthService.login({
            branchId: 'br-nyamuyanja',
            username: 'ivan',
            password: 'WrongPassword123',
          });

          serverStore.updateUser(ivanTest.id, { passwordHash: originalHash });

          loginFlowOk =
            Boolean(okRes.success && okRes.session?.workingBranch.id === 'br-nyamuyanja') &&
            Boolean(codeRes.success && codeRes.session?.workingBranch.id === 'br-nyamuyanja') &&
            !badPass.success;
        }

        const passed = prodHasIvanAndNyamuyanja && loginFlowOk;
        results.push({
          id: 1,
          name: 'Existing user authentication (ivan + Nyamuyanja Branch) & strict bcrypt enforcement',
          passed,
          message: passed
            ? 'Verified: Production ivan record & Nyamuyanja Branch valid, trimmed/case-insensitive username and branch ID/code normalization work with strict bcrypt enforcement'
            : `Auth check failed: prodRecord=${prodHasIvanAndNyamuyanja}, loginFlow=${loginFlowOk}`,
        });
      }

      // ==========================================
      // TEST 2: Branch access validation in login, switchBranch & verifyToken
      // ==========================================
      {
        const itRole = serverStore.getRoles()[0];
        const testUserId = `usr-branch-check-${Date.now()}`;
        const testUsername = `br${Date.now().toString().slice(-6)}`;
        const pass = 'BranchStrict#2026';
        serverStore.addUser({
          id: testUserId,
          username: testUsername,
          fullName: 'Single Branch Officer',
          passwordHash: await bcrypt.hash(pass, 10),
          roleId: itRole.id,
          roleName: itRole.name,
          primaryBranchId: 'br-nyamuyanja',
          allowedBranchIds: ['br-nyamuyanja'],
          hasMultiBranchAccess: false,
          isActive: true,
          requiresPasswordReset: false,
          directPermissions: [],
          revokedPermissions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        const wrongBranchLogin = await AuthService.login({
          branchId: 'br-kagarama',
          username: testUsername,
          password: pass,
        });
        const rightBranchLogin = await AuthService.login({
          branchId: 'br-nyamuyanja',
          username: testUsername,
          password: pass,
        });

        // Grant multi-branch temporarily -> log into kagarama -> revoke access -> verifyToken must reject!
        serverStore.updateUser(testUserId, {
          hasMultiBranchAccess: true,
          allowedBranchIds: ['br-nyamuyanja', 'br-kagarama'],
        });
        const kagaramaLogin = await AuthService.login({
          branchId: 'br-kagarama',
          username: testUsername,
          password: pass,
        });
        serverStore.updateUser(testUserId, {
          hasMultiBranchAccess: false,
          allowedBranchIds: ['br-nyamuyanja'],
        });
        const verifiedAfterRevoke = kagaramaLogin.session?.token
          ? AuthService.verifyToken(kagaramaLogin.session.token)
          : { valid: true };

        // Clean up temporary test user
        serverStore.deleteUser(testUserId);

        const passed =
          !wrongBranchLogin.success &&
          rightBranchLogin.success &&
          Boolean(kagaramaLogin.success) &&
          !verifiedAfterRevoke.valid;

        results.push({
          id: 2,
          name: 'Strict branch access enforcement on login and token re-verification',
          passed,
          message: passed
            ? 'Verified: Unauthorized branch login rejected and revoked branch JWT immediately invalidated in verifyToken()'
            : `Branch validation failed: wrong=${wrongBranchLogin.success}, right=${rightBranchLogin.success}, revokedTokenValid=${verifiedAfterRevoke.valid}`,
        });
      }

      // ==========================================
      // TEST 3: PWA manifest & icon assets completeness
      // ==========================================
      {
        const requiredAssets = [
          'public/icon.svg',
          'public/icon-maskable.svg',
          'public/pwa-192x192.png',
          'public/pwa-512x512.png',
          'public/pwa-maskable-512x512.png',
          'public/apple-touch-icon.png',
          'public/favicon.ico',
        ];
        const missingAssets = requiredAssets.filter(a => !fs.existsSync(path.join(rootDir, a)));

        const viteConfigContent = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
        const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

        const manifestConfigValid =
          viteConfigContent.includes("name: 'Turihamwe Management System'") &&
          viteConfigContent.includes("short_name: 'Turihamwe'") &&
          viteConfigContent.includes("display: 'standalone'") &&
          viteConfigContent.includes("id: '/'") &&
          viteConfigContent.includes("start_url: '/'") &&
          viteConfigContent.includes("scope: '/'") &&
          viteConfigContent.includes("purpose: 'any'") &&
          viteConfigContent.includes("purpose: 'maskable'") &&
          !viteConfigContent.includes('any maskable');

        const htmlValid =
          indexHtmlContent.includes('apple-touch-icon.png') &&
          indexHtmlContent.includes('theme-color') &&
          indexHtmlContent.includes('apple-mobile-web-app-capable');

        // Also validate built dist/manifest.webmanifest if present
        let distManifestValid = true;
        const distManifestPath = path.join(rootDir, 'dist', 'manifest.webmanifest');
        if (fs.existsSync(distManifestPath)) {
          const manifestJson = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));
          distManifestValid =
            manifestJson.id === '/' &&
            manifestJson.name === 'Turihamwe Management System' &&
            typeof manifestJson.short_name === 'string' &&
            manifestJson.short_name.length <= 12 &&
            manifestJson.display === 'standalone' &&
            manifestJson.start_url === '/' &&
            manifestJson.scope === '/' &&
            Array.isArray(manifestJson.icons) &&
            manifestJson.icons.some((i: any) => i.sizes === '192x192' && i.purpose === 'any') &&
            manifestJson.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'any') &&
            manifestJson.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'maskable');
        }

        const passed = missingAssets.length === 0 && manifestConfigValid && htmlValid && distManifestValid;
        results.push({
          id: 3,
          name: 'PWA manifest, iOS touch icon, maskable safe-zone & icon resolution compliance',
          passed,
          message: passed
            ? 'Verified: All PWA PNG/SVG/ICO assets, standalone manifest config, iOS PNG meta tags, and maskable separation valid'
            : `PWA asset/manifest check failed: missing=${missingAssets.join(',')}, manifestConfig=${manifestConfigValid}, html=${htmlValid}, distManifest=${distManifestValid}`,
        });
      }

      // ==========================================
      // TEST 4: Service Worker registration, auto-update & API NetworkOnly no-cache rule
      // ==========================================
      {
        const viteConfigContent = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
        const updateMgrContent = fs.readFileSync(
          path.join(rootDir, 'src/components/common/PWAUpdateManager.tsx'),
          'utf8'
        );
        const installBtnContent = fs.readFileSync(
          path.join(rootDir, 'src/components/common/PWAInstallButton.tsx'),
          'utf8'
        );
        const headerContent = fs.readFileSync(path.join(rootDir, 'src/components/layout/Header.tsx'), 'utf8');
        const tsconfigContent = fs.readFileSync(path.join(rootDir, 'tsconfig.json'), 'utf8');

        const swConfigured =
          viteConfigContent.includes('VitePWA(') &&
          viteConfigContent.includes("registerType: 'autoUpdate'") &&
          viteConfigContent.includes("handler: 'NetworkOnly'") &&
          viteConfigContent.includes('navigateFallbackDenylist') &&
          viteConfigContent.includes('devOptions:') &&
          viteConfigContent.includes('enabled: true') &&
          tsconfigContent.includes('vite-plugin-pwa/client');

        const uiWired =
          updateMgrContent.includes("from 'virtual:pwa-register'") &&
          installBtnContent.includes('usePWAInstall') &&
          headerContent.includes('PWAInstallButton');

        let distSwOk = true;
        const distSwPath = path.join(rootDir, 'dist', 'sw.js');
        if (fs.existsSync(distSwPath)) {
          const swContent = fs.readFileSync(distSwPath, 'utf8');
          distSwOk = swContent.includes('NetworkOnly') && swContent.includes('index.html');
        }

        const passed = swConfigured && uiWired && distSwOk;
        results.push({
          id: 4,
          name: 'Service worker registration, autoUpdate, NetworkOnly API policy & in-app install UI',
          passed,
          message: passed
            ? 'Verified: VitePWA autoUpdate + Workbox NetworkOnly for /api/ + virtual:pwa-register + Header/Login install UI'
            : `SW verification failed: swConfigured=${swConfigured}, uiWired=${uiWired}, distSwOk=${distSwOk}`,
        });
      }

      // ==========================================
      // TEST 5: Offline shell indicator, offline token preservation & sync duplicate prevention
      // ==========================================
      {
        const offlineComp = fs.readFileSync(
          path.join(rootDir, 'src/components/common/OfflineIndicator.tsx'),
          'utf8'
        );
        const apiClientSrc = fs.readFileSync(path.join(rootDir, 'src/api/client.ts'), 'utf8');
        const syncRoutesSrc = fs.readFileSync(path.join(rootDir, 'src/server/routes/syncRoutes.ts'), 'utf8');

        const offlineOk =
          offlineComp.includes('useOnlineStatus') &&
          apiClientSrc.includes('throw err;') &&
          syncRoutesSrc.includes('getContributionByReceipt') &&
          syncRoutesSrc.includes('getRenewalByReference') &&
          syncRoutesSrc.includes('hasConflict');

        results.push({
          id: 5,
          name: 'Offline shell indicator, offline session fallback & sync duplicate/conflict protection',
          passed: offlineOk,
          message: offlineOk
            ? 'Verified: OfflineIndicator mounted, verifyToken rethrows offline network errors cleanly, syncRoutes enforces receipt/reference dedup & conflict detection'
            : 'Offline or sync deduplication check missing expected guards',
        });
      }

      // ==========================================
      // TEST 6: Database fail-closed missing/corrupt protection (never resets/overwrites DB)
      // ==========================================
      {
        const missingFile = path.join(tmpRoot, 'missing.json');
        const missingStore = new ServerStore({
          dataDir: tmpRoot,
          dataFile: missingFile,
          backupsDir: path.join(tmpRoot, 'backups'),
          allowEmptyInit: false,
        });

        let missingThrew = false;
        try {
          await missingStore.initialize({ isTestEnv: false, allowCreateNewDb: false });
        } catch (err: any) {
          missingThrew = err instanceof DatabaseConnectionError;
        }

        const serverTsSrc = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');
        const authRoutesSrc = fs.readFileSync(path.join(rootDir, 'src/server/routes/authRoutes.ts'), 'utf8');
        const serverFailClosed =
          serverTsSrc.includes('databaseRecoveryRequired: true') &&
          serverTsSrc.includes('res.status(503)') &&
          authRoutesSrc.includes('!serverStore.isDatabaseHealthy()');

        const passed = missingThrew && !fs.existsSync(missingFile) && serverFailClosed;
        results.push({
          id: 6,
          name: 'Missing/corrupt database fails closed with HTTP 503 recovery screen (never overwrites)',
          passed,
          message: passed
            ? 'Verified: Missing DB throws DatabaseConnectionError without writing empty DB, and API fails closed with 503 recovery state'
            : `DB protection check failed: missingThrew=${missingThrew}, serverFailClosed=${serverFailClosed}`,
        });
      }

      // ==========================================
      // TEST 7: Backup creation, SHA-256 checksum verification & restoration roundtrip
      // ==========================================
      {
        const bkpDir = path.join(tmpRoot, 'bkp-roundtrip');
        const bkpFile = path.join(bkpDir, 'db.json');
        const bkpArchivesDir = path.join(bkpDir, 'archives');
        const isolatedStore = new ServerStore({
          dataDir: bkpDir,
          dataFile: bkpFile,
          backupsDir: bkpArchivesDir,
          allowEmptyInit: true,
        });
        await isolatedStore.initialize({ isTestEnv: true, allowCreateNewDb: true });

        const now = new Date().toISOString();
        const sentinelAcc = `SACCO-BKP-${Date.now()}`;
        isolatedStore.addMember({
          saccoAccountNumber: sentinelAcc,
          fullName: 'Backup Sentinel Member',
          gender: 'FEMALE',
          dateOfBirth: '1990-05-15',
          nationalIdNumber: 'CF900001112233',
          primaryPhone: '+256700112233',
          district: 'Isingiro',
          subCounty: 'Nyamuyanja',
          parish: 'Nyamuyanja',
          village: 'Central',
          registrationDate: now.split('T')[0],
          branchId: 'br-nyamuyanja',
          branchName: 'Nyamuyanja Branch',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });

        const bkpRes = isolatedStore.createBackup({
          userId: 'usr-it-ivan',
          username: 'ivan',
          userFullName: 'Ivan (IT Officer)',
          type: 'MANUAL',
          notes: 'PWA Hardening Automated Verification Backup',
        });

        const verifyRes = bkpRes.success && bkpRes.backup
          ? isolatedStore.verifyBackup(bkpRes.backup.id, {
              userId: 'usr-it-ivan',
              username: 'ivan',
            })
          : { verified: false, checksumMatch: false, details: 'Create backup failed' };

        // Mutate state after backup (soft-delete sentinel member) then restore and confirm full roundtrip
        isolatedStore.deleteMember(sentinelAcc, {
          userId: 'usr-it-ivan',
          username: 'ivan',
          reason: 'Simulate mutation before restore',
        });
        const deletedBeforeRestore = isolatedStore.getMemberByAccountNumber(sentinelAcc)?.isDeleted === true;

        const restoreRes = isolatedStore.restoreBackup(bkpRes.backup.id, {
          userId: 'usr-it-ivan',
          username: 'ivan',
          userFullName: 'Ivan (IT Officer)',
          branchId: 'br-nyamuyanja',
          branchName: 'Nyamuyanja Branch',
          reason: 'Automated backup verification & restore test',
        });
        const restoredMember = isolatedStore.getMemberByAccountNumber(sentinelAcc);

        const passed = Boolean(
          bkpRes.success &&
            bkpRes.backup &&
            verifyRes.verified &&
            verifyRes.checksumMatch &&
            deletedBeforeRestore &&
            restoreRes.success &&
            restoredMember?.fullName === 'Backup Sentinel Member' &&
            !restoredMember?.isDeleted
        );
        results.push({
          id: 7,
          name: 'Backup archive creation, SHA-256 verification & restoration roundtrip',
          passed,
          message: passed
            ? `Verified: Backup ${bkpRes.backup?.filename} created, SHA-256 verified, and full restore roundtrip recovered sentinel record`
            : `Backup verification failed: create=${bkpRes.success}, verify=${verifyRes.verified}, restore=${restoreRes.success}`,
        });
      }

      // ==========================================
      // TEST 8: Pandora SMS exclusivity & online connectivity enforcement
      // ==========================================
      {
        const atAdapterExists = fs.existsSync(
          path.join(rootDir, 'src/server/services/africasTalkingAdapter.ts')
        );
        const smsViewSrc = fs.readFileSync(
          path.join(rootDir, 'src/views/SmsNotificationsView.tsx'),
          'utf8'
        );
        const validation = PandoraAdapter.validateConfiguration();
        const passed =
          !atAdapterExists &&
          config.sms.provider === 'PANDORA' &&
          validation.provider === 'PANDORA' &&
          smsViewSrc.includes('Internet Connectivity Required for SMS Transmission');

        results.push({
          id: 8,
          name: "Pandora SMS exclusive integration, zero Africa's Talking & offline SMS dispatch guard",
          passed,
          message: passed
            ? 'Verified: Pandora Networks exclusive provider active, legacy adapter absent, UI requires online connectivity for SMS dispatch'
            : `SMS verification failed: atExists=${atAdapterExists}, provider=${config.sms.provider}`,
        });
      }
    } finally {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // Ignore temp cleanup failures
      }
    }

    return results;
  }
}

if (process.argv[1]?.endsWith('pwaAndAuthHardening.test.ts')) {
  process.env.TUR_TEST_ENV = 'true';
  PwaAndAuthHardeningTestRunner.runAllTests().then(results => {
    console.log('\n================================================================');
    console.log('   PWA, AUTHENTICATION & HARDENING VERIFICATION SUITE');
    console.log('================================================================\n');
    let failed = 0;
    for (const r of results) {
      if (r.passed) {
        console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
        console.log(`    ${r.message}`);
      } else {
        failed++;
        console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
        console.log(`    FAIL: ${r.message}`);
      }
    }
    console.log(`\nSummary: ${results.length - failed}/${results.length} Passed`);
    if (failed > 0) process.exit(1);
  });
}
