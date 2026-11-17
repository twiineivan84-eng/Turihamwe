import bcrypt from 'bcryptjs';
import { serverStore } from '../server/storage/serverStore';
import { config } from '../server/config';

/**
 * Isolated test-environment-only fixture helper.
 * Strictly guarded so it can NEVER execute against the production database.
 */
export async function ensureIsolatedTestAdmin(): Promise<void> {
  if (process.env.TUR_TEST_ENV !== 'true' || !config.database.dataFile.endsWith('turihamwe_test_suite_db.json')) {
    throw new Error('SAFETY BLOCK: Test admin fixture helper may ONLY execute inside the isolated test database.');
  }

  await serverStore.initialize({ isTestEnv: true, allowCreateNewDb: true });

  const existingIvan = serverStore.getUserByUsername('ivan');
  if (!existingIvan) {
    const branches = serverStore.getBranches();
    const roles = serverStore.getRoles();
    const hqBranch = branches.find(b => b.code === 'NYAMUYANJA') || branches[0];
    const itRole = roles.find(r => r.code === 'IT_OFFICER') || roles[0];
    const testHash = await bcrypt.hash('9090', 10);

    serverStore.addUser({
      id: 'usr-it-ivan',
      username: 'ivan',
      fullName: 'Ivan (IT Officer)',
      email: 'ivan.it@nyamuyanjasacco.ug',
      phone: '+256701009090',
      passwordHash: testHash,
      roleId: itRole.id,
      roleName: itRole.name,
      primaryBranchId: hqBranch.id,
      allowedBranchIds: branches.map(b => b.id),
      hasMultiBranchAccess: true,
      isActive: true,
      requiresPasswordReset: false,
      directPermissions: [],
      revokedPermissions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}
