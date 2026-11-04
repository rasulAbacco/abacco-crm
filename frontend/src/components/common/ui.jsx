// Small shared UI primitives.
import { useEffect } from 'react';
import { FiX, FiLoader, FiInbox, FiAlertTriangle, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { STATUS_COLORS } from '../../constants/options';
import { humanize } from '../../utils/format';

const TONES = {
  gray: 'bg-ink-100 text-ink-700', blue: 'bg-blue-50 text-blue-700', indigo: 'bg-indigo-50 text-indigo-700', green: 'bg-green-50 text-green-700',
  emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-700',
};

export function Badge({ children, tone = 'gray', className = '' }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone] ?? TONES.gray} ${className}`}>{children}</span>;
}

export function StatusBadge({ value }) {
  if (!value) return <span className="text-ink-400">—</span>;
  return <Badge tone={STATUS_COLORS[value] ?? 'gray'}>{humanize(value)}</Badge>;
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <FiLoader className={`animate-spin text-ink-400 ${className}`} aria-label="Loading" />;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-500">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = FiInbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-ink-100 p-3 text-ink-500"><Icon className="h-6 w-6" /></div>
      <p className="font-medium text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <FiAlertTriangle className="mb-2 h-6 w-6 text-red-500" />
      <p className="text-sm text-ink-700">{message}</p>
      {onRetry && <button className="btn-secondary btn-sm mt-3" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Alert({ tone = 'amber', children }) {
  const t = { amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-800', blue: 'border-blue-200 bg-blue-50 text-blue-900', green: 'border-green-200 bg-green-50 text-green-900' }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${t}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClass = 'p-4' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const t = { brand: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', gray: 'bg-ink-100 text-ink-700' }[tone];
  return (
    <div className="card flex items-start gap-3 p-4">
      {Icon && <div className={`rounded-lg p-2 ${t}`}><Icon className="h-4 w-4" /></div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold text-ink-900" title={typeof value === 'string' ? value : undefined}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`flex max-h-[92vh] w-full ${w} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-xl`}>
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="rounded p-1 text-ink-500 hover:bg-ink-100" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onClose, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{busy && <Spinner className="h-4 w-4" />}{confirmLabel}</button></>}>
      <p className="text-sm text-ink-700">{message}</p>
      {children}
    </Modal>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total <= meta.pageSize) return meta ? <p className="px-4 py-3 text-xs text-ink-500">{meta.total} result{meta.total === 1 ? '' : 's'}</p> : null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-ink-200 px-4 py-3 text-xs text-ink-500">
      <span>{from}–{to} of {meta.total}</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><FiChevronLeft /></button>
        <span className="px-2 py-1.5">Page {meta.page} / {meta.totalPages}</span>
        <button className="btn-secondary btn-sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page"><FiChevronRight /></button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === t.value ? 'border-brand-700 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded bg-ink-100 px-1.5 text-xs text-ink-700">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function DefinitionList({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-ink-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink-900">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, total, tone = 'bg-brand-600' }) {
  const p = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${tone}`} style={{ width: `${p}%` }} />
    </div>
  );
}
