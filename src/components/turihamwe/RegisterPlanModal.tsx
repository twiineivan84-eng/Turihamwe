import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TurihamwePlan, SaccoMember, TurihamweRegistrationType } from '../../types';
import { LocalRepository } from '../../db/local/localRepository';
import { localDb } from '../../db/local/sqliteEngine';
import { notifyRecordChanged } from '../../utils/systemEvents';
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

  // Form Fields per PART A requirements
  const [registrationType, setRegistrationType] = useState<TurihamweRegistrationType>(
    existingPlan?.registrationType || 'Fresh Registration'
  );

  const [contributionAmount, setContributionAmount] = useState<string>(
    existingPlan?.contributionAmount != null ? String(existingPlan.contributionAmount) : ''
  );

  const [registrationDate, setRegistrationDate] = useState<string>(
    existingPlan?.registrationDate ||
    existingPlan?.enrolmentDate ||
    existingPlan?.effectiveStartDate ||
    new Date().toISOString().split('T')[0]
  );

  // Expiry date: manually editable, preserved across saving/reloads
  const defaultExpiry = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  };

  const [expiryDate, setExpiryDate] = useState<string>(
    existingPlan?.expiryDate || existingPlan?.currentExpiryDate || defaultExpiry()
  );

  const [notes, setNotes] = useState(existingPlan?.notes || '');
  const [searching, setSearching] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canRegister = hasPermission('turihamwe.register_plan') || hasPermission('members.edit');

  // Synchronize when preselectedMember or existingPlan changes
  useEffect(() => {
    if (existingPlan) {
      setCurrentPlan(existingPlan);
      setSaccoAccountNumber(existingPlan.saccoAccountNumber);
      setRegistrationType(existingPlan.registrationType || 'Fresh Registration');
      if (existingPlan.contributionAmount != null) {
        setContributionAmount(String(existingPlan.contributionAmount));
      }
      setRegistrationDate(
        existingPlan.registrationDate ||
        existingPlan.enrolmentDate ||
        existingPlan.effectiveStartDate ||
        new Date().toISOString().split('T')[0]
      );
      setExpiryDate(existingPlan.expiryDate || existingPlan.currentExpiryDate || defaultExpiry());
      setNotes(existingPlan.notes || '');
      verifyMember(existingPlan.saccoAccountNumber);
    } else if (preselectedMember) {
      setMember(preselectedMember);
      setSaccoAccountNumber(preselectedMember.saccoAccountNumber);
      checkForExistingPlan(preselectedMember.saccoAccountNumber);
    }
  }, [existingPlan, preselectedMember, isOpen]);

  if (!isOpen) return null;

  const checkForExistingPlan = async (accountNo: string) => {
    try {
      const token = localStorage.getItem('turihamwe_token');
      const res = await fetch(`/api/turihamwe/plans/member/${accountNo}`, {
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
        if (p.registrationDate || p.effectiveStartDate) {
          setRegistrationDate(p.registrationDate || p.effectiveStartDate);
        }
        if (p.expiryDate || p.currentExpiryDate) {
          setExpiryDate(p.expiryDate || p.currentExpiryDate);
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
          if (match.registrationDate || match.effectiveStartDate) {
            setRegistrationDate(match.registrationDate || match.effectiveStartDate);
          }
          if (match.expiryDate || match.currentExpiryDate) {
            setExpiryDate(match.expiryDate || match.currentExpiryDate);
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

    // Validate registration date
    if (!registrationDate || !/^\d{4}-\d{2}-\d{2}$/.test(registrationDate)) {
      setSubmitError('Please provide a valid Registration Date (YYYY-MM-DD).');
      return;
    }

    // Validate expiry date
    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      setSubmitError('Please provide a valid Expiry Date (YYYY-MM-DD).');
      return;
    }

    if (expiryDate <= registrationDate) {
      setSubmitError('Expiry date must be after the registration date.');
      return;
    }

    // Validate contribution amount if provided
    let parsedContribution: number | undefined = undefined;
    if (contributionAmount !== '') {
      const num = Number(contributionAmount);
      if (isNaN(num) || num < 0) {
        setSubmitError('Contribution amount must be a valid, non-negative number in UGX.');
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
        registrationDate,
        expiryDate,
        effectiveStartDate: registrationDate,
        currentExpiryDate: expiryDate,
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
                {currentPlan ? 'Update Turihamwe Record' : 'Record Turihamwe Registration & Contribution'}
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

        {/* Informational Separation Banner */}
        <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Record-Keeping Only:</span> This form records Turihamwe registration details and historical contributions for SACCO members. It does <strong>not</strong> initiate financial transactions, generate cashbook entries, or issue transaction receipts.
          </div>
        </div>

        {submitError && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Member Selection / Verification */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Member SACCO Account Number *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={saccoAccountNumber}
                onChange={e => setSaccoAccountNumber(e.target.value.toUpperCase())}
                onBlur={() => verifyMember(saccoAccountNumber)}
                placeholder="e.g. NYA-001042"
                disabled={Boolean(existingPlan)}
                className="flex-1 px-3 py-2 font-mono uppercase bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                required
              />
              {!existingPlan && (
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
            {memberError && <p className="text-[11px] text-red-600 mt-1">{memberError}</p>}
          </div>

          {/* Member Card & Existing Plan Status */}
          {member && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">SACCO Member:</span>
                <span className="font-bold text-slate-900">{member.fullName}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500">Registered Branch:</span>
                <span className="text-slate-700 font-semibold">{member.branchName || 'SACCO Branch'}</span>
              </div>
              {currentPlan && (
                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-600 text-[11px]">Existing Turihamwe Plan:</span>
                  <span className="font-mono text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                    {currentPlan.id} ({currentPlan.status})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* A. Registration Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              A. Registration Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                  registrationType === 'Fresh Registration'
                    ? 'border-blue-600 bg-blue-50/60 font-bold text-blue-900 ring-1 ring-blue-500'
                    : 'border-slate-300 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="registrationType"
                  value="Fresh Registration"
                  checked={registrationType === 'Fresh Registration'}
                  onChange={() => setRegistrationType('Fresh Registration')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-bold">Fresh Registration</div>
                  <div className="text-[10px] text-slate-500 font-normal">First-time enrolment in Turihamwe</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                  registrationType === 'Renewal'
                    ? 'border-blue-600 bg-blue-50/60 font-bold text-blue-900 ring-1 ring-blue-500'
                    : 'border-slate-300 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="registrationType"
                  value="Renewal"
                  checked={registrationType === 'Renewal'}
                  onChange={() => setRegistrationType('Renewal')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-bold">Renewal</div>
                  <div className="text-[10px] text-slate-500 font-normal">Continuation of existing policy</div>
                </div>
              </label>
            </div>
          </div>

          {/* B. Contribution Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              B. Contribution Amount (UGX)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-bold text-xs">
                UGX
              </span>
              <input
                type="number"
                min="0"
                step="500"
                value={contributionAmount}
                onChange={e => setContributionAmount(e.target.value)}
                placeholder="e.g. 20000"
                className="w-full pl-12 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono font-semibold text-slate-900"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Recorded for administrative tracking only. No financial payment or receipt is triggered.
            </p>
          </div>

          {/* C. Registration Date & D. Expiry Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                C. Registration Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={registrationDate}
                  onChange={e => setRegistrationDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Editable historical date. Preserved exactly as entered.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                D. Expiry Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono font-bold text-emerald-800"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Editable expiry date. Never silently overwritten.
              </p>
            </div>
          </div>

          {/* Notes / Comments */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Record Notes & Historical References
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Migrated from manual Turihamwe register 2024 / Cashbook reference"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !member}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold shadow-xs transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Saving...' : currentPlan ? 'Save Turihamwe Record' : 'Record Turihamwe Enrolment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
