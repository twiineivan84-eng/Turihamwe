/**
 * TURIHAMWE BENEFICIARY RULES AUDIT TEST SUITE
 * Nyamuyanja SACCO Ltd
 *
 * Verifies the updated beneficiary eligibility and management policies end-to-end
 * (including live HTTP Express API endpoint enforcement):
 *  1. Register a member with one biological child (eligible and saved).
 *  2. Register a member with multiple biological children (all saved).
 *  3. Register a member with biological parent(s) (eligible and saved).
 *  4. Register a member with a spouse (eligible and saved).
 *  5. Register a member with all three permitted relationship categories.
 *  6. Register more than 13 eligible beneficiaries under one plan (15 beneficiaries, no limit).
 *  7. Confirm 14th and subsequent beneficiaries save successfully and can be queried via HTTP GET.
 *  8. Attempt to register a caretaker via API and confirm rejection (HTTP 400).
 *  9. Attempt to register an aunt or uncle via API and confirm rejection (HTTP 400).
 * 10. Attempt to submit unauthorized relationships through backend API and confirm rejection (HTTP 400).
 * 11. Attempt to submit an unauthorized relationship through bulk import API and confirm rejection (HTTP 400).
 * 12. Register the same biological parent under two siblings via API: duplicate notification & alert logging, allowed.
 * 13. Register a child below 18 and confirm successful registration under adult member plan.
 * 14. Mark a beneficiary as deceased via PATCH API and confirm that the owner's plan remains ACTIVE.
 * 15. Confirm historical beneficiary records remain intact & returned via GET (no physical deletion).
 * 16. Confirm that the existing owner/beneficiary death-claim process still works (UGX 500,000).
 */

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { serverStore } from '../server/storage/serverStore';
import { memberRouter } from '../server/routes/memberRoutes';
import { config } from '../server/config';
import { SaccoMember, TurihamwePlan, Beneficiary, TurihamweClaim } from '../types';
import {
  isPermittedBeneficiaryRelationship,
  calculateUgandaAge,
  getUgandaDateString,
} from '../utils/timezone';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export class TurihamweBeneficiaryRulesAuditRunner {
  public static async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    console.log('\n>>> [SUITE 15/15] TURIHAMWE BENEFICIARY ELIGIBILITY & MANAGEMENT RULES AUDIT (16 SCENARIOS)');

    await serverStore.initialize();

    const today = getUgandaDateString(new Date());

    // Ensure genuine IT officer 'ivan' is available for JWT signing
    const ivan = serverStore.getUserByUsername('ivan') || {
      id: 'usr-it-ivan',
      username: 'ivan',
      roleId: 'role-it',
    };

    const token = jwt.sign(
      {
        sub: ivan.id,
        username: ivan.username,
        workingBranchId: 'br-nyamuyanja',
        roleId: ivan.roleId,
      },
      config.auth.jwtSecret,
      { expiresIn: '1h' }
    );

    // Boot ephemeral Express test server mounting the real memberRouter
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api/members', memberRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const apiReq = async (method: string, path: string, body?: any): Promise<{ status: number; data: any }> => {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-working-branch': 'br-nyamuyanja',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, data: json };
    };

    const buildMemberPayload = (accountNumber: string, fullName: string, extra?: any) => ({
      saccoAccountNumber: accountNumber,
      fullName,
      gender: 'MALE',
      dateOfBirth: '1985-05-15',
      nationalIdNumber: `CM${Math.floor(10000000 + Math.random() * 90000000)}`,
      primaryPhone: '+256772111222',
      district: 'Isingiro',
      subCounty: 'Nyamuyanja',
      parish: 'Central',
      village: 'Kagarama',
      registrationDate: today,
      branchId: 'br-nyamuyanja',
      clientStatus: 'ALIVE',
      ...extra,
    });

    const createPlan = (accountNumber: string, memberName: string, planId: string): TurihamwePlan => {
      const nowIso = new Date().toISOString();
      const p: TurihamwePlan = {
        id: planId,
        saccoAccountNumber: accountNumber,
        memberName,
        planCode: 'STANDARD',
        status: 'ACTIVE',
        enrolmentDate: today,
        effectiveStartDate: today,
        currentExpiryDate: '2027-05-15',
        maturityDate: '2027-05-15',
        contributionAmount: 25000,
        coverageAmount: 500000,
        totalBeneficiariesCount: 0,
        registeredBranchId: 'br-nyamuyanja',
        registeredBranchName: 'Nyamuyanja Branch',
        registeredByUserId: 'usr-it-ivan',
        registeredByUsername: 'ivan',
        branchId: 'br-nyamuyanja',
        branchName: 'Nyamuyanja Branch',
        registrationType: 'Fresh Registration',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      serverStore.addPlan(p);
      return p;
    };

    try {
      // -------------------------------------------------------------
      // TEST 1: Register a member with one biological child
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-001';
        const res = await apiReq(
          'POST',
          '/api/members',
          buildMemberPayload(acc, 'John Baptist Mugisha', {
            beneficiaries: [
              {
                fullName: 'Brian Mugisha',
                relationship: 'BIOLOGICAL CHILD',
                dateOfBirth: '2012-08-10',
                nationalIdNumber: 'CM1200112233',
                percentageAllocation: 100,
              },
            ],
          })
        );
        createPlan(acc, 'John Baptist Mugisha', 'plan-ben-001');
        const createdBen: Beneficiary | undefined = res.data?.data?.beneficiaries?.[0];
        const passed =
          res.status === 201 &&
          res.data?.success === true &&
          createdBen?.relationship === 'Biological Child' &&
          createdBen?.status === 'ALIVE' &&
          !createdBen?.isDeceased;

        results.push({
          id: 1,
          name: 'Register Member with One Biological Child',
          passed,
          message: passed
            ? `Biological Child (${createdBen?.fullName}) successfully registered via POST /api/members with status ALIVE`
            : `Failed (${res.status}): ${res.data?.error}`,
        });
      } catch (err: any) {
        results.push({ id: 1, name: 'Register Member with One Biological Child', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 2: Register a member with multiple biological children
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-002';
        const res = await apiReq(
          'POST',
          '/api/members',
          buildMemberPayload(acc, 'Evelyn Ainembabazi', {
            beneficiaries: [
              { fullName: 'Peace Ainembabazi', relationship: 'Biological Child', dateOfBirth: '2010-01-10', percentageAllocation: 25 },
              { fullName: 'Faith Ainembabazi', relationship: 'Biological Child', dateOfBirth: '2012-01-10', percentageAllocation: 25 },
              { fullName: 'Hope Ainembabazi', relationship: 'Biological Child', dateOfBirth: '2014-01-10', percentageAllocation: 25 },
              { fullName: 'Grace Ainembabazi', relationship: 'Biological Child', dateOfBirth: '2016-01-10', percentageAllocation: 25 },
            ],
          })
        );
        createPlan(acc, 'Evelyn Ainembabazi', 'plan-ben-002');
        const bensRes = await apiReq('GET', `/api/members/${acc}/beneficiaries`);
        const allChildren: Beneficiary[] = bensRes.data?.data || [];

        const passed =
          res.status === 201 &&
          allChildren.length === 4 &&
          allChildren.every((c) => c.relationship === 'Biological Child');

        results.push({
          id: 2,
          name: 'Register Member with Multiple Biological Children',
          passed,
          message: passed
            ? 'All 4 biological children successfully enrolled and verified via API'
            : `Failed (${res.status}): count=${allChildren.length}`,
        });
      } catch (err: any) {
        results.push({ id: 2, name: 'Register Member with Multiple Biological Children', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 3: Register a member with biological parent(s)
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-003';
        const res = await apiReq(
          'POST',
          '/api/members',
          buildMemberPayload(acc, 'Moses Kanyesigye', {
            beneficiaries: [
              { fullName: 'Ezekiel Kanyesigye', relationship: 'Biological Parent', dateOfBirth: '1958-03-20', nationalIdNumber: 'CM5800112233', percentageAllocation: 50 },
              { fullName: 'Prudence Kanyesigye', relationship: 'BIOLOGICAL PARENT', dateOfBirth: '1962-09-14', nationalIdNumber: 'CF6200112233', percentageAllocation: 50 },
            ],
          })
        );
        createPlan(acc, 'Moses Kanyesigye', 'plan-ben-003');
        const createdBens: Beneficiary[] = res.data?.data?.beneficiaries || [];

        const passed =
          res.status === 201 &&
          createdBens.length === 2 &&
          createdBens.every((p) => p.relationship === 'Biological Parent' && p.status === 'ALIVE');

        results.push({
          id: 3,
          name: 'Register Member with Biological Parents',
          passed,
          message: passed
            ? 'Both biological parents registered under approved BIOLOGICAL PARENT category'
            : `Failed (${res.status}): ${res.data?.error}`,
        });
      } catch (err: any) {
        results.push({ id: 3, name: 'Register Member with Biological Parents', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 4: Register a member with a spouse
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-004';
        const res = await apiReq(
          'POST',
          '/api/members',
          buildMemberPayload(acc, 'Patrick Tumwine', {
            beneficiaries: [
              { fullName: 'Sarah Tumwine', relationship: 'SPOUSE', dateOfBirth: '1987-11-25', nationalIdNumber: 'CF8700998877', percentageAllocation: 100 },
            ],
          })
        );
        createPlan(acc, 'Patrick Tumwine', 'plan-ben-004');
        const spouse: Beneficiary | undefined = res.data?.data?.beneficiaries?.[0];

        const passed = res.status === 201 && spouse?.relationship === 'Spouse';
        results.push({
          id: 4,
          name: 'Register Member with Spouse',
          passed,
          message: passed
            ? `Spouse (${spouse?.fullName}) registered successfully under approved SPOUSE category`
            : `Failed (${res.status}): ${res.data?.error}`,
        });
      } catch (err: any) {
        results.push({ id: 4, name: 'Register Member with Spouse', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 5: Register member with all three permitted categories
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-005';
        const res = await apiReq(
          'POST',
          '/api/members',
          buildMemberPayload(acc, 'Denis Byamukama', {
            beneficiaries: [
              { fullName: 'Ian Byamukama', relationship: 'Biological Child', dateOfBirth: '2015-06-01' },
              { fullName: 'George Byamukama', relationship: 'Biological Parent', dateOfBirth: '1960-04-12' },
              { fullName: 'Christine Byamukama', relationship: 'Spouse', dateOfBirth: '1988-12-10' },
            ],
          })
        );
        createPlan(acc, 'Denis Byamukama', 'plan-ben-005');
        const all: Beneficiary[] = res.data?.data?.beneficiaries || [];

        const passed =
          res.status === 201 &&
          all.length === 3 &&
          all.some((x) => x.relationship === 'Biological Child') &&
          all.some((x) => x.relationship === 'Biological Parent') &&
          all.some((x) => x.relationship === 'Spouse');

        results.push({
          id: 5,
          name: 'Register Member with All 3 Permitted Categories',
          passed,
          message: passed
            ? 'Successfully enrolled Biological Child, Biological Parent, and Spouse under one member'
            : `Failed (${res.status}): ${res.data?.error}`,
        });
      } catch (err: any) {
        results.push({ id: 5, name: 'Register Member with All 3 Permitted Categories', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 6: Register more than 13 eligible beneficiaries (15 enrolled via API)
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-006';
        await apiReq('POST', '/api/members', buildMemberPayload(acc, 'Arthur Natukunda'));
        createPlan(acc, 'Arthur Natukunda', 'plan-ben-006');

        // Enroll 15 beneficiaries sequentially via POST /api/members/:acc/beneficiaries
        let allSucceeded = true;
        for (let i = 1; i <= 15; i++) {
          const addRes = await apiReq('POST', `/api/members/${acc}/beneficiaries`, {
            fullName: `Beneficiary Number ${i}`,
            relationship: i === 1 ? 'Spouse' : i <= 3 ? 'Biological Parent' : 'Biological Child',
            dateOfBirth: i <= 3 ? '1965-01-01' : '2015-01-01',
            percentageAllocation: Math.floor(100 / 15),
          });
          if (addRes.status !== 201) {
            allSucceeded = false;
            break;
          }
        }

        const plan = serverStore.getPlanByAccountNumber(acc);
        const storedBens = serverStore.getBeneficiariesByAccount(acc);
        const passed = allSucceeded && storedBens.length === 15 && (plan?.beneficiaryCount || 0) >= 15;

        results.push({
          id: 6,
          name: 'Register More Than 13 Eligible Beneficiaries (15 Enrolled)',
          passed,
          message: passed
            ? 'Successfully enrolled 15 beneficiaries via HTTP POST without any 13-member cap restrictions'
            : `Failed: enrolled=${storedBens.length}`,
        });
      } catch (err: any) {
        results.push({ id: 6, name: 'Register More Than 13 Eligible Beneficiaries', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 7: Query 14th and subsequent beneficiaries via HTTP GET
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-006';
        const getRes = await apiReq('GET', `/api/members/${acc}/beneficiaries`);
        const bens: Beneficiary[] = getRes.data?.data || [];
        const ben14 = bens[13]; // 14th beneficiary
        const ben15 = bens[14]; // 15th beneficiary

        const passed =
          getRes.status === 200 &&
          bens.length === 15 &&
          ben14?.fullName === 'Beneficiary Number 14' &&
          ben15?.fullName === 'Beneficiary Number 15' &&
          ben14?.status === 'ALIVE' &&
          ben15?.status === 'ALIVE';

        results.push({
          id: 7,
          name: 'Confirm 14th and Subsequent Beneficiaries Queryable',
          passed,
          message: passed
            ? `14th (${ben14.fullName}) and 15th (${ben15.fullName}) beneficiaries retrieved via GET API with ALIVE status`
            : `Failed: count=${bens.length}`,
        });
      } catch (err: any) {
        results.push({ id: 7, name: 'Confirm 14th and Subsequent Beneficiaries Queryable', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 8: Attempt to register Caretaker via HTTP API (HTTP 400)
      // -------------------------------------------------------------
      try {
        const res1 = await apiReq(
          'POST',
          '/api/members',
          buildMemberPayload('SACCO-BEN-008', 'Rejected Caretaker Member', {
            beneficiaries: [{ fullName: 'Invalid Caretaker', relationship: 'Caretaker', dateOfBirth: '1980-01-01' }],
          })
        );
        const res2 = await apiReq('POST', '/api/members/SACCO-BEN-001/beneficiaries', {
          fullName: 'Invalid Caretaker Direct',
          relationship: 'Caretaker',
          dateOfBirth: '1980-01-01',
        });

        const passed = res1.status === 400 && res2.status === 400 && !isPermittedBeneficiaryRelationship('Caretaker');
        results.push({
          id: 8,
          name: 'Attempt to Register Caretaker (Rejected HTTP 400)',
          passed,
          message: passed
            ? 'Relationship "Caretaker" strictly rejected with HTTP 400 across both registration and profile APIs'
            : `Unexpected status: reg=${res1.status}, direct=${res2.status}`,
        });
      } catch (err: any) {
        results.push({ id: 8, name: 'Attempt to Register Caretaker (Rejected HTTP 400)', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 9: Attempt to register Aunt or Uncle via HTTP API (HTTP 400)
      // -------------------------------------------------------------
      try {
        const resAunt = await apiReq('POST', '/api/members/SACCO-BEN-001/beneficiaries', {
          fullName: 'Mary Aunt',
          relationship: 'Aunt',
          dateOfBirth: '1975-02-15',
        });
        const resUncle = await apiReq('POST', '/api/members/SACCO-BEN-001/beneficiaries', {
          fullName: 'Peter Uncle',
          relationship: 'Uncle',
          dateOfBirth: '1972-07-10',
        });

        const passed = resAunt.status === 400 && resUncle.status === 400;
        results.push({
          id: 9,
          name: 'Attempt to Register Aunt or Uncle (Rejected HTTP 400)',
          passed,
          message: passed
            ? 'Both "Aunt" and "Uncle" relationships strictly rejected with HTTP 400'
            : `Unexpected status: aunt=${resAunt.status}, uncle=${resUncle.status}`,
        });
      } catch (err: any) {
        results.push({ id: 9, name: 'Attempt to Register Aunt or Uncle (Rejected HTTP 400)', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 10: Unauthorized relationships rejected by backend API (HTTP 400)
      // -------------------------------------------------------------
      try {
        const disallowed = ['Brother', 'Sister', 'Cousin', 'Grandparent', 'Guardian', 'Other relative', 'Friend', 'Nephew', 'Niece'];
        let all400 = true;
        for (const rel of disallowed) {
          const r = await apiReq('POST', '/api/members/SACCO-BEN-001/beneficiaries', {
            fullName: `Invalid ${rel}`,
            relationship: rel,
            dateOfBirth: '1990-01-01',
          });
          if (r.status !== 400) {
            all400 = false;
            break;
          }
        }

        results.push({
          id: 10,
          name: 'Backend API Rejection of Unauthorized Relationships',
          passed: all400,
          message: all400
            ? `All 9 prohibited relationship types (${disallowed.slice(0, 5).join(', ')}...) returned HTTP 400`
            : 'One or more prohibited relationship categories returned non-400',
        });
      } catch (err: any) {
        results.push({ id: 10, name: 'Backend API Rejection of Unauthorized Relationships', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 11: Bulk import containing unauthorized relationship rejected (HTTP 400)
      // -------------------------------------------------------------
      try {
        const bulkRes = await apiReq('POST', '/api/members/SACCO-BEN-001/beneficiaries/bulk', {
          beneficiaries: [
            { fullName: 'Valid Child One', relationship: 'Biological Child', dateOfBirth: '2015-01-01' },
            { fullName: 'Invalid Cousin Two', relationship: 'Cousin', dateOfBirth: '2010-01-01' },
          ],
        });

        const passed = bulkRes.status === 400;
        results.push({
          id: 11,
          name: 'Bulk Import Validation Rejection for Unauthorized Categories',
          passed,
          message: passed
            ? 'Bulk import POST /beneficiaries/bulk containing "Cousin" strictly rejected with HTTP 400'
            : `Unexpected bulk status: ${bulkRes.status}`,
        });
      } catch (err: any) {
        results.push({ id: 11, name: 'Bulk Import Validation Rejection', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 12: Shared Biological Parent across siblings via API (duplicate notice + alert log)
      // -------------------------------------------------------------
      try {
        const accSibling1 = 'SACCO-SIB-001';
        const accSibling2 = 'SACCO-SIB-002';
        await apiReq('POST', '/api/members', buildMemberPayload(accSibling1, 'Herbert Atuhaire'));
        createPlan(accSibling1, 'Herbert Atuhaire', 'plan-sib-001');

        await apiReq('POST', '/api/members', buildMemberPayload(accSibling2, 'Scovia Atuhaire'));
        createPlan(accSibling2, 'Scovia Atuhaire', 'plan-sib-002');

        const parentNin = 'CM5500998877AA';
        const parentName = 'Jackson Atuhaire';
        const parentDob = '1955-07-20';

        // Sibling 1 registers parent
        const r1 = await apiReq('POST', `/api/members/${accSibling1}/beneficiaries`, {
          fullName: parentName,
          relationship: 'Biological Parent',
          dateOfBirth: parentDob,
          nationalIdNumber: parentNin,
        });

        // Sibling 2 registers the same parent -> allowed + returns duplicateParentNotice + logs SystemAlert
        const r2 = await apiReq('POST', `/api/members/${accSibling2}/beneficiaries`, {
          fullName: parentName,
          relationship: 'Biological Parent',
          dateOfBirth: parentDob,
          nationalIdNumber: parentNin,
        });

        const notice = r2.data?.duplicateParentNotice;
        const alerts = serverStore.getAlerts();
        const alertLogged = alerts.some(
          (a) => a.category === 'SHARED_BIOLOGICAL_PARENT_DETECTED' && a.message.includes(parentName)
        );

        const passed =
          r1.status === 201 &&
          r2.status === 201 &&
          notice?.type === 'DUPLICATE_BIOLOGICAL_PARENT_DETECTED' &&
          notice?.existingMemberAccountNumber === accSibling1 &&
          alertLogged;

        results.push({
          id: 12,
          name: 'Shared Biological Parent Duplicate Detection (Allowed & Logged)',
          passed,
          message: passed
            ? `Duplicate biological parent (${parentName}) detected under sibling ${accSibling1}, notification returned, SystemAlert logged, and enrollment approved`
            : `Failed: r1=${r1.status}, r2=${r2.status}, notice=${Boolean(notice)}, alertLogged=${alertLogged}`,
        });
      } catch (err: any) {
        results.push({ id: 12, name: 'Shared Biological Parent Duplicate Detection', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 13: Child below 18 eligible under adult member plan
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-013';
        await apiReq('POST', '/api/members', buildMemberPayload(acc, 'Juliet Nimusiima'));
        createPlan(acc, 'Juliet Nimusiima', 'plan-ben-013');

        const minorDob = '2018-04-10';
        const ageRes = calculateUgandaAge(minorDob);

        const res = await apiReq('POST', `/api/members/${acc}/beneficiaries`, {
          fullName: 'Ethan Mugisha Nimusiima',
          relationship: 'Biological Child',
          dateOfBirth: minorDob,
        });

        const passed =
          res.status === 201 &&
          ageRes.age < 18 &&
          ageRes.isEligibleForTurihamwe &&
          res.data?.data?.status === 'ALIVE';

        results.push({
          id: 13,
          name: 'Child Below 18 Eligible Under Adult Plan',
          passed,
          message: passed
            ? `Minor child (${ageRes.age} years old) successfully enrolled as eligible beneficiary under adult member plan`
            : `Minor child enrollment failed (${res.status})`,
        });
      } catch (err: any) {
        results.push({ id: 13, name: 'Child Below 18 Eligible Under Adult Plan', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 14: Beneficiary marked DECEASED via PATCH, owner plan remains ACTIVE
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-014';
        await apiReq('POST', '/api/members', buildMemberPayload(acc, 'Godfrey Twinomugisha'));
        createPlan(acc, 'Godfrey Twinomugisha', 'plan-ben-014');

        const addRes = await apiReq('POST', `/api/members/${acc}/beneficiaries`, {
          fullName: 'Enid Twinomugisha',
          relationship: 'Spouse',
          dateOfBirth: '1982-10-15',
        });
        const benId = addRes.data?.data?.id;

        const patchRes = await apiReq('PATCH', `/api/members/${acc}/beneficiaries/${benId}/status`, {
          status: 'DECEASED',
          reason: 'Verified demise from illness',
        });

        const currentPlan = serverStore.getPlanByAccountNumber(acc);
        const passed =
          patchRes.status === 200 &&
          patchRes.data?.data?.status === 'DECEASED' &&
          patchRes.data?.data?.isDeceased === true &&
          currentPlan?.status === 'ACTIVE';

        results.push({
          id: 14,
          name: 'Beneficiary Marked DECEASED Preserves Active Plan Status',
          passed,
          message: passed
            ? `Beneficiary marked DECEASED via PATCH /status; Member's Turihamwe Plan ${currentPlan?.id} remains strictly ACTIVE`
            : `Failed (${patchRes.status}): planStatus=${currentPlan?.status}`,
        });
      } catch (err: any) {
        results.push({ id: 14, name: 'Beneficiary Marked DECEASED Preserves Active Plan Status', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 15: Historical beneficiary records remain intact & returned via GET
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-014';
        const getRes = await apiReq('GET', `/api/members/${acc}/beneficiaries`);
        const allBens: Beneficiary[] = getRes.data?.data || [];
        const deceasedBen = allBens.find((x) => x.fullName === 'Enid Twinomugisha');

        const passed =
          getRes.status === 200 &&
          allBens.length > 0 &&
          deceasedBen !== undefined &&
          deceasedBen.status === 'DECEASED' &&
          deceasedBen.isDeceased === true &&
          deceasedBen.deceasedReason === 'Verified demise from illness';

        results.push({
          id: 15,
          name: 'Historical Beneficiary Records Intact (No Physical Deletion)',
          passed,
          message: passed
            ? 'Deceased beneficiary record preserved in historical database and returned on GET for strikethrough UI rendering'
            : `Deceased beneficiary record missing from GET (${allBens.length} records)`,
        });
      } catch (err: any) {
        results.push({ id: 15, name: 'Historical Beneficiary Records Intact', passed: false, message: err.message });
      }

      // -------------------------------------------------------------
      // TEST 16: Existing death claim process operates normally (UGX 500,000)
      // -------------------------------------------------------------
      try {
        const acc = 'SACCO-BEN-016';
        await apiReq('POST', '/api/members', buildMemberPayload(acc, 'Pius Ahimbisibwe'));
        const plan = createPlan(acc, 'Pius Ahimbisibwe', 'plan-ben-016');

        const ben = serverStore.addBeneficiary({
          saccoAccountNumber: acc,
          fullName: 'Jovita Ahimbisibwe',
          relationship: 'Biological Parent',
          dateOfBirth: '1959-02-14',
        });

        const nowIso = new Date().toISOString();
        const claim: TurihamweClaim = {
          id: 'claim-ben-016',
          claimReference: 'CLM-2026-0016',
          planId: plan.id,
          saccoAccountNumber: acc,
          memberName: 'Pius Ahimbisibwe',
          claimCategory: 'DEATH_OF_BENEFICIARY',
          beneficiaryId: ben.id,
          deceasedName: ben.fullName,
          relationshipToMember: 'Biological Parent',
          dateOfDeath: today,
          dateOfBurial: today,
          amount: 500000,
          status: 'SUBMITTED',
          claimDate: today,
          incidentDate: today,
          incidentDescription: 'Bereavement of registered biological parent',
          branchId: 'br-nyamuyanja',
          branchName: 'Nyamuyanja Branch',
          preparerUserId: 'usr-it-ivan',
          preparerUsername: 'ivan',
          preparerFullName: 'Ivan IT Officer',
          supportingDocuments: [],
          reviewHistory: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          isSynced: true,
        };
        serverStore.addClaim(claim);

        serverStore.approveClaim(claim.id, {
          decision: 'APPROVED',
          decidedByUserId: 'usr-gm-nya',
          decidedByUsername: 'gmnya',
          decidedByFullName: 'General Manager',
          branchId: 'br-nyamuyanja',
          branchName: 'Nyamuyanja Branch',
          decisionDate: nowIso,
          reasonOrReference: 'APR-2026-0016',
          decisionNotes: 'Verified biological parent burial documentation',
        });

        serverStore.recordClaimPayment(claim.id, {
          paymentDate: today,
          recordedByUserId: 'usr-it-ivan',
          recordedByUsername: 'ivan',
          recordedAt: nowIso,
          disbursementNotes: 'Disbursed UGX 500,000 burial benefit to member',
          paymentReference: 'VOUCHER-0016',
        });

        const settledClaim = serverStore.getClaimById(claim.id);
        const updatedBen = serverStore.getBeneficiaryById(ben.id);
        const postClaimPlan = serverStore.getPlanByAccountNumber(acc);

        const passed =
          (settledClaim?.status === 'CLOSED' || (settledClaim?.status as any) === 'SETTLED') &&
          settledClaim?.amount === 500000 &&
          updatedBen?.status === 'DECEASED' &&
          postClaimPlan?.status === 'ACTIVE';

        results.push({
          id: 16,
          name: 'Death Claim Process Operates with UGX 500,000 Benefit',
          passed,
          message: passed
            ? "Burial claim of UGX 500,000 approved, settled, beneficiary marked DECEASED, and owner's plan remains ACTIVE"
            : 'Death claim processing failed',
        });
      } catch (err: any) {
        results.push({ id: 16, name: 'Death Claim Process Operates Normally', passed: false, message: err.message });
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    return results;
  }
}

// Auto-execute if run via CLI
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('turihamweBeneficiaryRulesAudit.test.ts')) {
  TurihamweBeneficiaryRulesAuditRunner.runAllTests()
    .then((results) => {
      const passed = results.filter((r) => r.passed).length;
      for (const r of results) {
        console.log(`  ${r.passed ? '✓' : '✗'} Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
      }
      console.log(`\nAUDIT FINISHED: ${passed}/${results.length} PASSED`);
      if (passed !== results.length) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Audit execution error:', err);
      process.exit(1);
    });
}
