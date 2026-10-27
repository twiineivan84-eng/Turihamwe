import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TurihamwePlan, SaccoMember, TurihamweRegistrationType } from '../../types';
import { LocalRepository } from '../../db/local/localRepository';
import { localDb } from '../../db/local/sqliteEngine';
import { notifyRecordChanged } from '../../utils/systemEvents';
import { calculateAnnualMaturityDate } from '../../utils/timezone';
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
      setRegistrationType(existingPlan.registrationType || 'Fresh Registration');
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
      setSaccoAccountNumber(preselectedMember.saccoAccountNumber);
      checkForExistingPlan(preselectedMember.saccoAccountNumber);
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

  const checkForExistingPlan = async (accountNo: string) => {
    try {
      const token = localStorage.getItem('turihamwe_token');
      const res = await fetch(`/api/turihamwe/plans/account/${accountNo}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'x-working-branch': workingBranch?.id || '',
        },
      });
      if (res.ok) {
        const p: TurihamwePlan = await res.json();
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
    } catch {
      // Ignored
    }
  };

  const verifyMember = async (accountNo: string) => {
    const clean = accountNo.trim().toUpperCase();
    if (!clean) return;
    setSearching(true);
    setMemberError(null);

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
        setMemberError(`SACCO member account "${clean}" not found.`);
      } else {
        setMember(found);
        setMemberError(null);
        await checkForExistingPlan(clean);
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
          {member && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
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
            </div>
          )}

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
    </div>
  );
};
