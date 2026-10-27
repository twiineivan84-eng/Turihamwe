import React from 'react';
import { X, ShieldCheck, Sliders, Info, CheckCircle2, AlertOctagon, HelpCircle } from 'lucide-react';

interface BusinessRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessRulesModal: React.FC<BusinessRulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Turihamwe Business Rules & Institutional Policy
              </h2>
              <p className="text-[11px] text-slate-400">
                Nyamuyanja SACCO Ltd • Approved Operating Rules & Specifications
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

        <div className="p-6 space-y-4 text-xs text-slate-700 max-h-[75vh] overflow-y-auto">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-bold">Institutional Policy Standard:</strong> Turihamwe policies operate under strict SACCO governance rules. Unapproved financial penalties, automated fees, or unprescribed limits must never be applied. All dates and financial records maintain strict audit trails.
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Parameter / Policy Rule</th>
                  <th className="px-4 py-3">Policy Status</th>
                  <th className="px-4 py-3">Institutional Policy Specification & Behavior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {/* Rule A */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div>Contribution Amount</div>
                    <span className="text-[10px] font-normal text-slate-500">Validation & Recording</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ACTIVE POLICY
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 leading-relaxed">
                    Must be recorded against the verified Turihamwe member and plan. Validated as a strictly positive monetary value (UGX). No unapproved financial limits or arbitrary contribution ceilings are invented. Full audit trail preserved.
                  </td>
                </tr>

                {/* Rule B */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div>Contribution Frequency</div>
                    <span className="text-[10px] font-normal text-slate-500">Annual Plan Cycle</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      ACTIVE POLICY
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 leading-relaxed">
                    Operates on an annual cycle. The renewal/maturity date is calculated from the explicitly recorded subscription date, according to agreed annual plan rules. Staff record-entry date (<code className="font-mono text-slate-600">createdAt</code>) is never substituted for actual subscription date.
                  </td>
                </tr>

                {/* Rule C */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div>Plan Duration</div>
                    <span className="text-[10px] font-normal text-slate-500">1-Year Coverage Term</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      ACTIVE POLICY
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 leading-relaxed">
                    Runs for exactly one year from recorded subscription date. Dates are calculated and stored consistently (with leap day Feb 29 safely mapped to Feb 28 in non-leap years). Avoids calculating a moving expiry date from today's date when viewing records.
                  </td>
                </tr>

                {/* Rule D */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div>Alert Schedule</div>
                    <span className="text-[10px] font-normal text-slate-500">Maturity-Date SMS</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ACTIVE POLICY
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 leading-relaxed">
                    Alerts trigger on the actual plan maturity date (Africa/Kampala timezone). Uses exact approved Runyankore text. Unapproved advance intervals (30d/14d/7d spam) are suppressed. Pending alerts are cancelled or updated when subscription dates change.
                  </td>
                </tr>

                {/* Rule E */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div>Penalties & Late Fees</div>
                    <span className="text-[10px] font-normal text-slate-500">Financial Deductions</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      STRICTLY PROHIBITED
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 leading-relaxed">
                    No automatic late fees, financial penalties, interest charges, or punitive monetary deductions are ever applied. Policy status is managed administratively without unapproved financial burdens on members.
                  </td>
                </tr>

                {/* Rule F */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div>Reactivation Eligibility</div>
                    <span className="text-[10px] font-normal text-slate-500">Staff Authorization</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                      CONTROLLED WORKFLOW
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 leading-relaxed">
                    Reactivation of expired or lapsed plans requires explicit staff permission, verified justification note, and full audit logging. Automated reactivation guessing is prohibited.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600">
            <strong>Approved SMS Notice Text (Runyankore):</strong>
            <p className="mt-1 font-mono text-[10px] bg-white p-2 rounded border border-slate-200 text-slate-800">
              "NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba"
            </p>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs transition shadow-xs"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
