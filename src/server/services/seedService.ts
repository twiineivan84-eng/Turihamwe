import { serverStore } from '../storage/serverStore';

/**
 * Reference Configuration Service
 *
 * SECURITY & DATA INTEGRITY POLICY:
 * - This service NEVER creates, modifies, restores, or seeds staff user accounts.
 * - This service NEVER creates, imports, or generates SACCO member records, Turihamwe plans,
 *   beneficiaries, contributions, claims, or fake system alerts.
 * - Only non-operational institutional reference configuration (the single approved
 *   EXPIRY_DATE_NOTICE SMS template and removal of discontinued advance templates)
 *   is validated here.
 */
export class SeedService {
  public static async ensureReferenceConfiguration(): Promise<void> {
    await serverStore.initialize();

    const approvedExpiryText =
      'NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba';

    // Ensure the single approved EXPIRY_DATE_NOTICE SMS template exists
    const existingTemplates = serverStore.getSmsTemplates();
    if (existingTemplates.length === 0) {
      serverStore.addSmsTemplate({
        id: 'tmpl-exp-due',
        code: 'EXPIRY_DATE_NOTICE',
        category: 'EXPIRY_DATE_NOTICE' as const,
        name: 'Official Turihamwe Plan Expiry Notice',
        templateText: approvedExpiryText,
        availableVariables: [],
        isActive: true,
        createdByUserId: 'system',
        createdByUserFullName: 'System Reference Configuration',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const existingDueTmpl = existingTemplates.find(
        t => t.category === 'EXPIRY_DATE_NOTICE' || t.code === 'EXPIRY_DATE_NOTICE'
      );
      if (existingDueTmpl && existingDueTmpl.templateText !== approvedExpiryText) {
        existingDueTmpl.templateText = approvedExpiryText;
        existingDueTmpl.name = 'Official Turihamwe Plan Expiry Notice';
        existingDueTmpl.isActive = true;
        serverStore.updateSmsTemplate(existingDueTmpl);
      }

      // Ensure discontinued advance reminder templates remain permanently removed
      const discontinuedCodes = [
        'EXPIRY_30_DAYS',
        'EXPIRY_14_DAYS',
        'EXPIRY_7_DAYS',
        'CLAIM_SUBMITTED_NOTICE',
        'CLAIM_DOCS_REQUESTED_NOTICE',
        'CLAIM_APPROVED_NOTICE',
        'CLAIM_REJECTED_NOTICE',
        'CONTRIBUTION_RECEIPT_NOTICE',
      ];
      for (const code of discontinuedCodes) {
        serverStore.deleteSmsTemplate(code);
      }
    }
  }

  /**
   * Preserved method signature for reference data validation only.
   * Automatic staff or SACCO member seeding is permanently disabled across all environments.
   */
  public static async seedInitialData(): Promise<void> {
    await this.ensureReferenceConfiguration();
  }
}
