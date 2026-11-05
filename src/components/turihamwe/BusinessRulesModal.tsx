import React from 'react';
import { X, ShieldCheck, Info, CheckCircle2 } from 'lucide-react';

interface BusinessRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessRulesModal: React.FC<BusinessRulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const rules = [
    {
      num: 1,
      title: 'Registration Fee',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      value: 'UGX 25,000',
      desc: 'One-time initial enrollment fee for new members registering into Turihamwe. Recorded with actual transaction date and payment receipt reference.',
    },
    {
      num: 2,
      title: 'Annual Renewal Fee',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      value: 'UGX 20,000',
      desc: 'Annual subscription renewal fee paid on or before expiry date. Extends coverage for exactly 12 calendar months.',
    },
    {
      num: 3,
      title: 'Renewal After Expiry (Post-Lapse Fee)',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
      value: 'UGX 25,000',
      desc: 'Fee required for renewal after plan expiry date has passed. Re-establishes plan coverage under full audit logging.',
    },
    {
      num: 4,
      title: 'Subscription Frequency',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      value: 'Annual Only',
      desc: 'Turihamwe operates exclusively on an annual cycle. Semi-annual, quarterly, monthly, and flexible cycles are strictly prohibited under SACCO operating rules.',
    },
    {
      num: 5,
      title: 'Cover Duration',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      value: '12 Calendar Months',
      desc: 'Coverage runs for exactly 12 calendar months from the actual subscription date recorded during registration or renewal. Consistent leap-year handling (Feb 29 -> Feb 28).',
    },
    {
      num: 6,
      title: 'Grace Period Prohibited (Immediate Expiry)',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
      value: 'Zero Grace Period',
      desc: 'No 6-month grace period, no cover extension, no automatic cover continuation. Plans expire immediately on their exact maturity date unless renewed. Status lifecycle: ACTIVE -> EXPIRED -> REACTIVATED.',
    },
    {
      num: 7,
      title: 'Current Benefit Amount',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      value: 'UGX 500,000',
      desc: 'Established burial support benefit. Beneficiary death pays benefit to member and keeps plan active. Member death pays claimant, marks member Deceased, and closes plan.',
    },
    {
      num: 8,
      title: 'Expiry Notification Timing',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      value: 'Exact Maturity Date',
      desc: 'SMS dispatched on the exact plan maturity date at 09:00 EAT (Africa/Kampala timezone). Advance 30d/14d/7d spam intervals and post-expiry follow-ups are suppressed.',
    },
    {
      num: 9,
      title: 'SMS Gateway Provider',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      value: 'Pandora Networks (Uganda)',
      desc: 'Exclusive SMS gateway provider. Standard Runyankore message text with strict duplicate dispatch prevention and full delivery journaling.',
    },
    {
      num: 10,
      title: 'Maximum Family Members',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
      value: '13 Family Members',
      desc: 'Maximum 13 total family members per Turihamwe plan (1 primary member + up to 12 active beneficiaries). Eligible relationships: biological children, parents, and at most 1 spouse/wife.',
    },
    {
      num: 11,
      title: 'Maximum Beneficiary Age',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      value: '70 Years at Enrollment',
      desc: 'Beneficiary age cannot exceed 70 years at initial enrollment (enforced via date of birth). Existing active running plans are grandfathered/exempted.',
    },
    {
      num: 12,
      title: 'Permanent SACCO Account Number (Indefinite Validity)',
      status: 'ACTIVE POLICY',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      value: 'Indefinite • No Expiry',
      desc: 'A SACCO account number is a permanent institutional member record and has NO expiry date, NO time limitation, NO automatic deactivation, and NO restrictions based on Turihamwe subscription status. It remains valid indefinitely even if Turihamwe cover expires, is not renewed, or has zero transactions. Only Turihamwe welfare coverage has a maturity date.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Turihamwe Business Rules & Parameters
              </h2>
              <p className="text-[11px] text-slate-400">
                Nyamuyanja SACCO Ltd • Established Operational Specifications & Governance Rules
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
              <strong className="font-bold">Official SACCO Operating Standard:</strong> The 12 parameters below represent the established Turihamwe operational policies. Financial deductions, unapproved penalties, arbitrary ceilings, or unscheduled notifications are strictly prohibited.
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Parameter & Value</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Established Operational Specification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {rules.map(r => (
                  <tr key={r.num} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono font-bold text-slate-400">{r.num}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{r.title}</div>
                      <div className="font-mono text-blue-700 font-semibold text-[10px] mt-0.5">{r.value}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${r.badgeColor}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 leading-relaxed">
                      {r.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600">
            <strong>Approved SMS Notice Text (Runyankore):</strong>
            <p className="mt-1 font-mono text-[10px] bg-white p-2.5 rounded border border-slate-200 text-slate-800">
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
