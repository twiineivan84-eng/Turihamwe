import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Search, ArrowLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import { TurihamwePlan } from '../../types';

interface ExistingMemberVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  saccoAccountNumber: string;
  memberName: string;
  dateOfBirth: string;
  calculatedAge: number;
  onVerifiedExisting: (plan: TurihamwePlan) => void;
  onRejectedNewMember: () => void;
}

export const ExistingMemberVerificationModal: React.FC<ExistingMemberVerificationModalProps> = ({
  isOpen,
  onClose,
  saccoAccountNumber,
  memberName,
  dateOfBirth,
  calculatedAge,
  onVerifiedExisting,
  onRejectedNewMember,
}) => {
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectedNotice, setRejectedNotice] = useState(false);
  const [verifiedPlan, setVerifiedPlan] = useState<TurihamwePlan | null>(null);

  if (!isOpen) return null;

  const handleVerifyYes = async () => {
    setVerifying(true);
    setErrorMessage(null);
    setRejectedNotice(false);

    try {
      const token = localStorage.getItem('turihamwe_token');
      const response = await fetch('/api/turihamwe/verify-existing-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          saccoAccountNumber: saccoAccountNumber.trim().toUpperCase(),
          dateOfBirth,
        }),
      });

      const data = await response.json();

      if (response.ok && data.verified && data.plan) {
        setVerifiedPlan(data.plan);
        // Automatically notify parent after a brief feedback moment or via confirmation button
      } else {
        // EXACT REQUIRED MESSAGE
        setErrorMessage(
          data.error ||
          'Existing Turihamwe membership could not be verified. Please confirm the SACCO account number and consult an authorised officer.'
        );
      }
    } catch {
      setErrorMessage(
        'Existing Turihamwe membership could not be verified. Please confirm the SACCO account number and consult an authorised officer.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirmVerified = () => {
    if (verifiedPlan) {
      onVerifiedExisting(verifiedPlan);
      onClose();
    }
  };

  const handleSelectNo = () => {
    setRejectedNotice(true);
    setErrorMessage(null);
    onRejectedNewMember();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/30 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Existing Turihamwe Membership Verification
              </h2>
              <p className="text-[11px] text-amber-100">
                Policy 7: Maximum Age for New Enrolment (69 Years)
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Person summary banner */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">{memberName || 'Member Applicant'}</span>
              <span className="font-mono font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded text-[11px]">
                {saccoAccountNumber}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 text-[11px] pt-1 border-t border-slate-200/60">
              <span>Date of Birth: <strong className="font-mono text-slate-800">{dateOfBirth}</strong></span>
              <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                Calculated Age: {calculatedAge} years (EAT)
              </span>
            </div>
          </div>

          {!rejectedNotice && !verifiedPlan && (
            <div className="space-y-4">
              {/* Prompt Message */}
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-950 text-xs leading-relaxed space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="font-semibold text-slate-900 text-xs">
                    This person is above the maximum age for new Turihamwe enrolment. Has this person previously been registered as a Turihamwe member?
                  </p>
                </div>
                <p className="text-[11px] text-slate-600 pl-6">
                  <strong>Institutional Policy:</strong> New enrolment into the Turihamwe welfare scheme is restricted to applicants aged 69 or younger. Senior members aged 70 or older who were enrolled prior to reaching the age threshold are grandfathered and permitted to continue or renew their coverage upon verification.
                </p>
                <p className="text-[10px] text-slate-500 pl-6 italic">
                  Note: A permanent SACCO account alone does not constitute Turihamwe membership. The system must verify an existing Turihamwe welfare policy record in the database.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <p className="font-bold text-red-950">Verification Unsuccessful</p>
                    <p className="text-[11px] text-red-800 mt-0.5">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleVerifyYes}
                  disabled={verifying}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                  {verifying ? 'Verifying Database...' : 'YES — EXISTING MEMBER'}
                </button>

                <button
                  type="button"
                  onClick={handleSelectNo}
                  disabled={verifying}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 text-red-600" />
                  NO — NEW MEMBER
                </button>
              </div>
            </div>
          )}

          {/* VERIFIED EXISTING MEMBER SUCCESS VIEW */}
          {verifiedPlan && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Existing Turihamwe Membership Confirmed</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Verified historical policy <strong>{verifiedPlan.id}</strong> (Status: <strong>{verifiedPlan.status}</strong>) registered on <strong>{verifiedPlan.enrolmentDate || verifiedPlan.subscriptionDate}</strong>.
                </p>
                <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 text-[11px] text-slate-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Grandfathered Status:</span>
                    <strong className="text-emerald-800">Approved for Continuation / Renewal</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>SACCO Account ID:</span>
                    <strong className="font-mono text-slate-900">{verifiedPlan.saccoAccountNumber}</strong>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleConfirmVerified}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Proceed with Authorized Renewal / Continuation
                </button>
              </div>
            </div>
          )}

          {/* REJECTED NEW MEMBER VIEW (BUTTON 2: NO — NEW MEMBER) */}
          {rejectedNotice && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 text-xs space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-rose-900">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>New Enrolment Blocked</span>
                </div>
                {/* EXACT REQUIRED MESSAGE */}
                <p className="text-xs text-rose-900 font-semibold leading-relaxed">
                  New Turihamwe enrolment is not permitted for persons aged 70 years or above under the current eligibility policy. Existing Turihamwe members may be verified for continued membership or renewal.
                </p>
                <div className="p-2.5 bg-white/80 rounded-lg border border-rose-200 text-[11px] text-slate-600 space-y-1">
                  <p>
                    • No Turihamwe policy or beneficiary records will be created.
                  </p>
                  <p>
                    • <strong>SACCO Account Number {saccoAccountNumber}</strong> remains fully valid, permanent, and unaffected.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Registration Form
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
