import { AlertCircle, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { MOTION_EASE } from '../../lib/motion.ts';

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="rounded-xl border border-border-hairline bg-surface-canvas p-6 animate-pulse"
      aria-hidden="true"
    >
      <div className="h-4 w-1/3 rounded bg-surface-muted mb-4" />
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-3.5 w-full rounded bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="rounded-xl border border-border-hairline bg-surface-canvas overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="h-11 bg-surface-subtle border-b border-border-hairline" />
      <div className="divide-y divide-border-hairline">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4">
            <div className="h-4 w-1/3 rounded bg-surface-muted" />
            <div className="h-4 w-1/4 rounded bg-surface-muted" />
            <div className="h-4 w-20 rounded bg-surface-muted ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-hairline bg-surface-canvas px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle border border-border-hairline text-brand-primary">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-secondary">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-semantic-danger/25 bg-semantic-danger/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
          <p className="mt-1 text-sm text-ink-secondary">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-hairline bg-surface-canvas px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-subtle transition-colors active:scale-[0.98] shrink-0 whitespace-nowrap"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: MOTION_EASE }}
        className="w-full max-w-md rounded-xl border border-border-hairline bg-surface-canvas p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-ink-primary">
          {title}
        </h2>
        <p className="mt-2 text-sm text-ink-secondary">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg border border-border-hairline bg-surface-canvas px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-subtle transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="rounded-lg bg-semantic-danger px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
