import { FiCheckCircle, FiAlertCircle, FiX } from 'react-icons/fi';
import { useUiStore } from '../../store/uiStore';

export default function Toasts() {
  const { toasts, dismiss } = useUiStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm shadow-lg ${t.type === 'error' ? 'border-red-200' : 'border-ink-200'}`}>
          {t.type === 'error' ? <FiAlertCircle className="mt-0.5 shrink-0 text-red-600" /> : <FiCheckCircle className="mt-0.5 shrink-0 text-emerald-600" />}
          <span className="flex-1 text-ink-900">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-700" aria-label="Dismiss"><FiX /></button>
        </div>
      ))}
    </div>
  );
}
