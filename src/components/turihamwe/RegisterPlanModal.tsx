import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TurihamwePlan, SaccoMember, TurihamweRegistrationType } from '../../types';
import { LocalRepository } from '../../db/local/localRepository';
import { localDb } from '../../db/local/sqliteEngine';
import { notifyRecordChanged } from '../../utils/systemEvents';
import { calculateAnnualMaturityDate, calculateUgandaAge, MAX_NEW_TURIHAMWE_ENROLMENT_AGE, MAX_TURIHAMWE_ELIGIBLE_AGE } from '../../utils/timezone';
import { ExistingMemberVerificationModal } from './ExistingMemberVerificationModal';
import { ShieldCheck, X, CheckCircle2, AlertCircle, Calendar, DollarSign, Info } from 'lucide-react';

interface RegisterPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (plan: TurihamwePlan) => void;
  preselectedMember?: SaccoMember | null;
  existingPlan?: TurihamwePlan | null;
}

export const RegisterPlanModal: React.FC<RegisterPlanModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedMember,
  existingPlan,
}) => {
  const { user, workingBranch, hasPermission } = useAuth();

  const [saccoAccountNumber, setSaccoAccountNumber] = useState(
    existingPlan?.saccoAccountNumber || preselectedMember?.saccoAccountNumber || ''
  );
  const [member, setMember] = useState<SaccoMember | null>(preselectedMember || null);
  const [currentPlan, setCurrentPlan] = useState<TurihamwePlan | null>(existingPlan || null);

  const [registrationType, setRegistrationType] = useState<TurihamweRegistrationType>(
    existingPlan?.registrationType || 'Fresh Registration'
  );

  const [contributionAmount, setContributionAmount] = useState<string>(
    existingPlan?.contributionAmount != null ? String(existingPlan.contributionAmount) : ''
  );

  // Dedicated required Subscription Date (actual plan subscription date)
  const initialSubscriptionDate = existingPlan?.subscriptionDate ||
    existingPlan?.registrationDate ||
    existingPlan?.enrolmentDate ||
    existingPlan?.effectiveStartDate ||
    '';

  const [subscriptionDate, setSubscriptionDate] = useState<string>(initialSubscriptionDate);
  const [maturityDate, setMaturityDate] = useState<string>(
    existingPlan?.maturityDate ||
    existingPlan?.currentExpiryDate ||
    existingPlan?.expiryDate ||
    (initialSubscriptionDate ? calculateAnnualMaturityDate(initialSubscriptionDate) : '')
  );

  const [justificationReason, setJustificationReason] = useState('');
  const [notes, setNotes] = useState(existingPlan?.notes || '');
  const [searching, setSearching] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Age 70+ Existing Turihamwe Membership Verification States (Sections 1-6)
  const [memberDob, setMemberDob] = useState<string>(preselectedMember?.dateOfBirth || '');
  const [isEditingDob, setIsEditingDob] = useState<boolean>(false);
  const [dobCorrectionReason, setDobCorrectionReason] = useState<string>('');
  const [showAgeVerificationModal, setShowAgeVerificationModal] = useState(false);
  const [verifiedGrandfatheredMember, setVerifiedGrandfatheredMember] = useState(false);
  const [enrolmentBlockedNotice, setEnrolmentBlockedNotice] = useState<string | null>(null);
  const [lastVerifiedDob, setLastVerifiedDob] = useState<string | null>(null);

  const canRegister = hasPermission('turihamwe.register_plan') || hasPermission('members.edit');

  // When subscriptionDate changes, automatically calculate annual maturity date (1-year anniversary)
  const handleSubscriptionDateChange = (newDateStr: string) => {
    setSubscriptionDate(newDateStr);
    if (/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) {
      try {
        const calculated = calculateAnnualMaturityDate(newDateStr);
        setMaturityDate(calculated);
      } catch {
        // Ignored
      }
    }
  };

  // Synchronize when preselectedMember or existingPlan changes
  useEffect(() => {
    if (existingPlan) {
      setCurrentPlan(existingPlan);
      setSaccoAccountNumber(existingPlan.saccoAccountNumber);
      setRegistrationType(existingPlan.registrationType || 'Renewal');
      if (existingPlan.contributionAmount != null) {
        setContributionAmount(String(existingPlan.contributionAmount));
      }
      const existingSubDate = existingPlan.subscriptionDate ||
        existingPlan.registrationDate ||
        existingPlan.enrolmentDate ||
        existingPlan.effectiveStartDate ||
        '';
      setSubscriptionDate(existingSubDate);
      setMaturityDate(
        existingPlan.maturityDate ||
        existingPlan.currentExpiryDate ||
        existingPlan.expiryDate ||
        (existingSubDate ? calculateAnnualMaturityDate(existingSubDate) : '')
      );
      setNotes(existingPlan.notes || '');
      verifyMember(existingPlan.saccoAccountNumber);
    } else if (preselectedMember) {
      setMember(preselectedMember);
      setMemberDob(preselectedMember.dateOfBirth);
      setSaccoAccountNumber(preselectedMember.saccoAccountNumber);
      checkForExistingPlan(preselectedMember.saccoAccountNumber, preselectedMember.dateOfBirth);
      // For fresh registration, if no subscription date yet, leave empty or default to today without forcing
      if (!subscriptionDate) {
        const today = new Date().toISOString().split('T')[0];
        setSubscriptionDate(today);
        setMaturityDate(calculateAnnualMaturityDate(today));
      }
    } else if (isOpen && !subscriptionDate) {
      const today = new Date().toISOString().split('T')[0];
      setSubscriptionDate(today);
      setMaturityDate(calculateAnnualMaturityDate(today));
    }
  }, [existingPlan, preselectedMember, isOpen]);

  if (!isOpen) return null;

  const checkForExistingPlan = async (accountNo: string, dobToCheck?: string) => {
    try {
      let planFound: TurihamwePlan | null = null;
      const token = localStorage.getItem('turihamwe_token');
      const res = await fetch(`/api/turihamwe/plans/account/${accountNo}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'x-working-branch': workingBranch?.id || '',
        },
      });
      if (res.ok) {
        const p: TurihamwePlan = await res.json();
        planFound = p;
        setCurrentPlan(p);
        if (p.registrationType) setRegistrationType(p.registrationType);
        if (p.contributionAmount != null) setContributionAmount(String(p.contributionAmount));
        const subDate = p.subscriptionDate || p.registrationDate || p.effectiveStartDate || '';
        if (subDate) {
          setSubscriptionDate(subDate);
          setMaturityDate(p.maturityDate || p.currentExpiryDate || calculateAnnualMaturityDate(subDate));
        }
        if (p.notes) setNotes(p.notes);
      } else {
        // Look up local
        const localPlans = await LocalRepository.searchPlans(accountNo);
        const match = localPlans.find(lp => lp.saccoAccountNumber === accountNo);
        if (match) {
          planFound = match;
          setCurrentPlan(match);
          if (match.registrationType) setRegistrationType(match.registrationType);
          if (match.contributionAmount != null) setContributionAmount(String(match.contributionAmount));
          const subDate = match.subscriptionDate || match.registrationDate || match.effectiveStartDate || '';
          if (subDate) {
            setSubscriptionDate(subDate);
            setMaturityDate(match.maturityDate || match.currentExpiryDate || calculateAnnualMaturityDate(subDate));
          }
          if (match.notes) setNotes(match.notes);
        }
      }

      // Check age limit for new registration (Policy 7 / Section 1-2)
      const effectiveDob = dobToCheck || memberDob || member?.dateOfBirth;
      if (effectiveDob) {
        const ageRes = calculateUgandaAge(effectiveDob);
        if (ageRes.isValid && ageRes.age >= MAX_TURIHAMWE_ELIGIBLE_AGE && !planFound && !verifiedGrandfatheredMember) {
          // Pause registration and prompt for existing member verification
          setShowAgeVerificationModal(true);
        }
      }
    } catch {
      // Ignored
    }
  };

  const handleDobChange = (newDob: string) => {
    setMemberDob(newDob);
    const ageRes = calculateUgandaAge(newDob);

    // Section 6: If Date of Birth is changed after verification prompt appears:
    // Recalculate age immediately, re-evaluate eligibility, reset previous verification decision if altered
    if (lastVerifiedDob && lastVerifiedDob !== newDob) {
      setVerifiedGrandfatheredMember(false);
      setLastVerifiedDob(null);
    }
    setEnrolmentBlockedNotice(null);

    if (ageRes.isValid) {
      if (ageRes.age >= MAX_TURIHAMWE_ELIGIBLE_AGE && !currentPlan && !verifiedGrandfatheredMember) {
        setShowAgeVerificationModal(true);
      }
    }
  };

  const verifyMember = async (accountNo: string) => {
    const clean = accountNo.trim().toUpperCase();
    if (!clean) return;
    setSearching(true);
    setMemberError(null);
    setEnrolmentBlockedNotice(null);
    setVerifiedGrandfatheredMember(false);
    setLastVerifiedDob(null);

    try {
      let found: SaccoMember | null = null;
      try {
        const token = localStorage.getItem('turihamwe_token');
        const res = await fetch(`/api/members/${clean}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
        });
        if (res.ok) found = await res.json();
      } catch {
        // Fallback to local
      }

      if (!found) {
        const local = await LocalRepository.getMemberByAccount(clean);
        if (local) found = local;
      }

      if (!found) {
        setMember(null);
        setMemberDob('');
        setMemberError(`SACCO member account "${clean}" not found.`);
      } else {
        setMember(found);
        setMemberDob(found.dateOfBirth);
        setMemberError(null);
        await checkForExistingPlan(clean, found.dateOfBirth);
      }
    } catch {
      setMemberError('Error verifying SACCO member');
    } finally {
      setSearching(false);
    }
  };

  const isEditingSubscriptionDate = currentPlan &&
    (currentPlan.subscriptionDate || currentPlan.registrationDate || currentPlan.effectiveStartDate) &&
    subscriptionDate !== (currentPlan.subscriptionDate || currentPlan.registrationDate || currentPlan.effectiveStartDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRegister) {
      setSubmitError('Permission denied: You do not have authorization to record Turihamwe registration.');
      return;
    }

    if (!member) {
      setSubmitError('Please verify a valid SACCO member.');
      return;
    }

    if (!registrationType) {
      setSubmitError('Registration type is required. Please select Fresh Registration or Renewal.');
      return;
    }

    const effectiveDob = memberDob || member.dateOfBirth;
    const ageRes = calculateUgandaAge(effectiveDob);
    if (!ageRes.isValid) {
      setSubmitError(`Member date of birth validation failed: ${ageRes.error || 'Invalid date of birth'}.`);
      return;
    }

    // Section 4: If blocked notice is active (e.g., user selected NO — NEW MEMBER for age 70+)
    if (enrolmentBlockedNotice) {
      setSubmitError(enrolmentBlockedNotice);
      return;
    }

    // Section 1-5: Applicants aged 70 or older
    if (ageRes.age >= MAX_TURIHAMWE_ELIGIBLE_AGE) {
      if (!currentPlan && !verifiedGrandfatheredMember) {
        setShowAgeVerificationModal(true);
        setSubmitError(
          'This applicant is aged 70 or above. Existing Turihamwe membership verification is required.'
        );
        return;
      }
    }

    // New enrolment restriction (age 70 or above cannot be registered as fresh enrolment without grandfathered verification)
    if (registrationType === 'Fresh Registration' && ageRes.age >= MAX_TURIHAMWE_ELIGIBLE_AGE && !verifiedGrandfatheredMember && !currentPlan) {
      setSubmitError(
        'New Turihamwe enrolment is not permitted for persons aged 70 years or above under the current eligibility policy. Existing Turihamwe members may be verified for continued membership or renewal.'
      );
      return;
    }

    // Validate subscription date (mandatory requirement)
    if (!subscriptionDate || !/^\d{4}-\d{2}-\d{2}$/.test(subscriptionDate)) {
      setSubmitError('Please provide a valid Subscription Date (YYYY-MM-DD).');
      return;
    }

    // Validate maturity date
    const computedMaturity = maturityDate || calculateAnnualMaturityDate(subscriptionDate);
    if (!computedMaturity || !/^\d{4}-\d{2}-\d{2}$/.test(computedMaturity)) {
      setSubmitError('Invalid annual maturity date calculation.');
      return;
    }

    // If changing subscription date on an existing plan, justification is required
    if (isEditingSubscriptionDate && !justificationReason.trim()) {
      setSubmitError('A justification reason is required when modifying a member\'s recorded subscription date.');
      return;
    }

    // Validate contribution amount if provided
    let parsedContribution: number | undefined = undefined;
    if (contributionAmount !== '') {
      const num = Number(contributionAmount);
      if (isNaN(num) || num < 0) {
        setSubmitError('Contribution amount must be a valid, positive number in UGX.');
        return;
      }
      parsedContribution = num;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        saccoAccountNumber: member.saccoAccountNumber,
        registrationType,
        contributionAmount: parsedContribution,
        subscriptionDate,
        maturityDate: computedMaturity,
        registrationDate: subscriptionDate,
        expiryDate: computedMaturity,
        effectiveStartDate: subscriptionDate,
        currentExpiryDate: computedMaturity,
        justificationReason: justificationReason.trim() || undefined,
        notes: notes.trim(),
        isRecordKeepingOnly: true,
      };

      const token = localStorage.getItem('turihamwe_token');

      // If Date of Birth was altered, record authorized member correction to audit trail (Section 6)
      if (memberDob && memberDob !== member.dateOfBirth) {
        try {
          await fetch(`/api/members/${member.saccoAccountNumber}/corrections`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token ? `Bearer ${token}` : '',
              'x-working-branch': workingBranch?.id || '',
            },
            body: JSON.stringify({
              fieldChanged: 'dateOfBirth',
              newValue: memberDob,
              reason: dobCorrectionReason.trim() || 'Date of birth corrected during Turihamwe registration workflow',
            }),
          });
        } catch {
          // Non-blocking fallback
        }
      }

      // Use PUT if existing plan exists, or POST which updates seamlessly if plan already exists
      const endpoint = currentPlan
        ? `/api/turihamwe/plans/${currentPlan.id}`
        : '/api/turihamwe/plans';
      const method = currentPlan ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          'x-working-branch': workingBranch?.id || '',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Server error saving Turihamwe record');
      }

      const savedPlan: TurihamwePlan = await res.json();

      // Persist plan in local store and update member's insurance status across system
      await LocalRepository.savePlanLocally(savedPlan);
      const localMem = await localDb.members.get(savedPlan.saccoAccountNumber);
      if (localMem) {
        localMem.turihamweStatus = 'ACTIVE';
        localMem.updatedAt = new Date().toISOString();
        await localDb.members.put(localMem);
      }

      notifyRecordChanged('PLAN', currentPlan ? 'UPDATED' : 'CREATED', savedPlan.id, savedPlan);
      onSuccess(savedPlan);
      onClose();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error saving Turihamwe record');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                {currentPlan ? 'Update Turihamwe Plan Record' : 'Record Turihamwe Registration & Plan'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Operating Branch: <span className="text-white font-semibold">{workingBranch?.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Business Rule Notice */}
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 text-[11px] text-blue-900 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            <strong>Annual Cycle Rule:</strong> Annual maturity date is calculated as exactly 1 year from the member's subscription date. Historical subscription dates are preserved.
          </span>
        </div>

        {enrolmentBlockedNotice && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-rose-950">New Turihamwe Enrolment Blocked (Age ≥ 70)</p>
              <p className="leading-relaxed text-rose-900">{enrolmentBlockedNotice}</p>
            </div>
          </div>
        )}

        {submitError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Member SACCO Account Number */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
              SACCO Account Number *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                disabled={!!currentPlan || !!preselectedMember}
                value={saccoAccountNumber}
                onChange={e => setSaccoAccountNumber(e.target.value.toUpperCase())}
                placeholder="e.g. NYA-001042"
                className="flex-1 px-3 py-2 text-xs font-mono uppercase bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                required
              />
              {!currentPlan && !preselectedMember && (
                <button
                  type="button"
                  onClick={() => verifyMember(saccoAccountNumber)}
                  disabled={searching || !saccoAccountNumber.trim()}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {searching ? 'Verifying...' : 'Verify'}
                </button>
              )}
            </div>
            {memberError && <p className="text-[11px] text-red-600 font-medium mt-1">{memberError}</p>}
          </div>

          {/* Member Card */}
          {member && (() => {
            const effectiveDob = memberDob || member.dateOfBirth;
            const ageRes = calculateUgandaAge(effectiveDob);
            return (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900">{member.fullName}</span>
                  <span className="text-[10px] font-mono bg-blue-100 text-blue-900 px-2 py-0.5 rounded font-bold">
                    {member.saccoAccountNumber}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 flex justify-between">
                  <span>Branch: {member.branchName || workingBranch?.name}</span>
                  <span>Phone: {member.primaryPhone}</span>
                </div>
                <div className="text-[11px] text-slate-600 flex flex-wrap justify-between items-center pt-1.5 border-t border-slate-200/60 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span>DOB:</span>
                    {isEditingDob ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={memberDob}
                          onChange={e => handleDobChange(e.target.value)}
                          className="px-2 py-0.5 border border-slate-300 rounded font-mono text-xs bg-white text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setIsEditingDob(false)}
                          className="text-[10px] bg-slate-200 hover:bg-slate-300 px-1.5 py-0.5 rounded font-semibold text-slate-700"
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <>
                        <strong className="font-mono text-slate-800">{effectiveDob}</strong>
                        <button
                          type="button"
                          onClick={() => setIsEditingDob(true)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline ml-1"
                        >
                          Change DOB
                        </button>
                      </>
                    )}
                  </div>
                  {ageRes.isValid ? (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        ageRes.age <= MAX_NEW_TURIHAMWE_ENROLMENT_AGE
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : (verifiedGrandfatheredMember || currentPlan)
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        Age: {ageRes.age} yrs {
                          ageRes.age <= MAX_NEW_TURIHAMWE_ENROLMENT_AGE
                            ? '(Eligible ≤ 69 for New Enrolment)'
                            : (verifiedGrandfatheredMember || currentPlan)
                            ? '(Grandfathered Member)'
                            : '(Age ≥ 70 — Verification Required)'
                        }
                      </span>
                      {ageRes.age >= MAX_TURIHAMWE_ELIGIBLE_AGE && !currentPlan && !verifiedGrandfatheredMember && (
                        <button
                          type="button"
                          onClick={() => setShowAgeVerificationModal(true)}
                          className="text-[10px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-2 py-0.5 rounded shadow-2xs transition"
                        >
                          Verify Membership
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      DOB Unverified
                    </span>
                  )}
                </div>

                {isEditingDob && memberDob !== member.dateOfBirth && (
                  <div className="pt-1.5 border-t border-slate-200/60">
                    <input
                      type="text"
                      value={dobCorrectionReason}
                      onChange={e => setDobCorrectionReason(e.target.value)}
                      placeholder="Audit reason for Date of Birth correction (e.g. Correcting typo per National ID)"
                      className="w-full px-2 py-1 text-[11px] bg-white border border-amber-300 rounded focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Registration Type */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
              Registration Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
                  registrationType === 'Fresh Registration'
                    ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold'
                    : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="registrationType"
                  value="Fresh Registration"
                  checked={registrationType === 'Fresh Registration'}
                  onChange={() => setRegistrationType('Fresh Registration')}
                  className="text-blue-600"
                />
                <span>Fresh Registration</span>
              </label>

              <label
                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
                  registrationType === 'Renewal'
                    ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold'
                    : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="registrationType"
                  value="Renewal"
                  checked={registrationType === 'Renewal'}
                  onChange={() => setRegistrationType('Renewal')}
                  className="text-purple-600"
                />
                <span>Renewal</span>
              </label>
            </div>
          </div>

          {/* Dedicated Subscription Date & Auto-Calculated Annual Maturity Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Subscription Date *
              </label>
              <input
                type="date"
                value={subscriptionDate}
                onChange={e => handleSubscriptionDateChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1">Actual date member subscribed to annual plan</p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Annual Maturity Date (Calculated) *
              </label>
              <input
                type="date"
                value={maturityDate}
                onChange={e => setMaturityDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-emerald-800 bg-emerald-50/50 border border-emerald-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
                required
              />
              <p className="text-[10px] text-emerald-700 mt-1">Exactly 1-year anniversary from subscription date</p>
            </div>
          </div>

          {/* If subscription date is edited on existing plan, require justification */}
          {isEditingSubscriptionDate && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-1">
              <label className="block text-xs font-bold text-amber-900">
                Subscription Date Change Justification *
              </label>
              <p className="text-[11px] text-amber-700">
                You are modifying the recorded subscription date from {currentPlan?.subscriptionDate || currentPlan?.registrationDate || currentPlan?.effectiveStartDate} to {subscriptionDate}. An audited justification is required.
              </p>
              <input
                type="text"
                value={justificationReason}
                onChange={e => setJustificationReason(e.target.value)}
                placeholder="e.g. Correcting historical ledger subscription date per approved SACCO file"
                required
                className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600"
              />
            </div>
          )}

          {/* Contribution Amount */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
              Initial Contribution Amount (UGX)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">UGX</span>
              <input
                type="number"
                min="0"
                step="500"
                value={contributionAmount}
                onChange={e => setContributionAmount(e.target.value)}
                placeholder="e.g. 75000"
                className="w-full pl-12 pr-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Optional initial contribution recorded upon registration</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
              Policy Notes / Reference
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Initial policy enrollment recorded at branch"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !member}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Saving Record...' : currentPlan ? 'Update Plan' : 'Save Turihamwe Plan'}
            </button>
          </div>
        </form>
      </div>

      {/* Existing Turihamwe Membership Verification Modal (Sections 2-4) */}
      {showAgeVerificationModal && member && (
        <ExistingMemberVerificationModal
          isOpen={showAgeVerificationModal}
          onClose={() => setShowAgeVerificationModal(false)}
          saccoAccountNumber={member.saccoAccountNumber}
          memberName={member.fullName}
          dateOfBirth={memberDob || member.dateOfBirth}
          calculatedAge={calculateUgandaAge(memberDob || member.dateOfBirth).age}
          onVerifiedExisting={verifiedPlan => {
            setVerifiedGrandfatheredMember(true);
            setLastVerifiedDob(memberDob || member.dateOfBirth);
            setCurrentPlan(verifiedPlan);
            setRegistrationType('Renewal');
            setEnrolmentBlockedNotice(null);
            setShowAgeVerificationModal(false);
          }}
          onRejectedNewMember={() => {
            setVerifiedGrandfatheredMember(false);
            setEnrolmentBlockedNotice(
              'New Turihamwe enrolment is not permitted for persons aged 70 years or above under the current eligibility policy. Existing Turihamwe members may be verified for continued membership or renewal.'
            );
          }}
        />
      )}
    </div>
  );
};
