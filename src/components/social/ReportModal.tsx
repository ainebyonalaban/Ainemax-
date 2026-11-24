import React, { useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { submitSafetyReport } from '../../services/socialService';
import { ReportTargetType, SOCIAL_CONSTRAINTS } from '../../types/social';

interface ReportModalProps {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  onClose: () => void;
}

const REPORT_REASONS = [
  'Spam or misleading content',
  'Harassment or hate speech',
  'Impersonation or fake account',
  'Unsafe or illegal content',
  'Other community guideline violation',
] as const;

export function ReportModal({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: ReportModalProps) {
  const { firebaseUser } = useAuth();
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await submitSafetyReport(firebaseUser.uid, {
        targetType,
        targetId,
        reason,
        details,
      });
      setSubmitted(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${targetType}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Flag className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Report {targetType}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Your report regarding <span className="font-semibold">{targetLabel}</span> has been logged for review by AINEMAX moderators.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reporting: <span className="font-medium text-slate-700 dark:text-slate-200">{targetLabel}</span>
            </p>

            <div>
              <label htmlFor="report-reason" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Reason
              </label>
              <select
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="report-details" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Additional context (optional)
                </label>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {details.length}/{SOCIAL_CONSTRAINTS.REPORT_DETAILS_MAX}
                </span>
              </div>
              <textarea
                id="report-details"
                rows={3}
                maxLength={SOCIAL_CONSTRAINTS.REPORT_DETAILS_MAX}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Share helpful details for our safety team..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none resize-none"
              />
            </div>

            {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>Submit report</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
