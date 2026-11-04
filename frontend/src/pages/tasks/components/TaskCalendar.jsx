import { useMemo } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TaskCalendar({ month, onMonth, tasks, onOpen }) {
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);
  const byDay = useMemo(() => {
    const m = {};
    for (const t of tasks) if (t.dueAt) (m[new Date(t.dueAt).toDateString()] ??= []).push(t);
    return m;
  }, [tasks]);
  const today = new Date().toDateString();
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
        <button className="btn-ghost btn-sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><FiChevronLeft /></button>
        <p className="text-sm font-semibold">{month.toLocaleString('en', { month: 'long', year: 'numeric' })}</p>
        <button className="btn-ghost btn-sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><FiChevronRight /></button>
      </div>
      <div className="grid grid-cols-7 border-b border-ink-200 bg-ink-50 text-center text-[11px] font-semibold uppercase text-ink-500">{DAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const items = byDay[d.toDateString()] ?? [];
          const other = d.getMonth() !== month.getMonth();
          return (
            <div key={d.toISOString()} className={`min-h-[84px] border-b border-r border-ink-100 p-1 ${other ? 'bg-ink-50/60' : ''}`}>
              <p className={`mb-1 text-right text-xs ${d.toDateString() === today ? 'font-bold text-brand-700' : other ? 'text-ink-400' : 'text-ink-700'}`}>{d.getDate()}</p>
              {items.slice(0, 3).map((t) => (
                <button key={t.id} onClick={() => onOpen(t)} className={`mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${t.status === 'DONE' ? 'bg-ink-100 text-ink-400 line-through' : new Date(t.dueAt) < new Date() ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'}`}>{t.title}</button>
              ))}
              {items.length > 3 && <p className="text-[10px] text-ink-500">+{items.length - 3} more</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
