import { useState } from 'react';
import { FiX } from 'react-icons/fi';
import { COUNTRIES, TIMEZONES, CURRENCIES } from '../../constants/options';
import { humanize } from '../../utils/format';

export function Field({ label, error, hint, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}{required && <span className="text-red-600"> *</span>}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  );
}

export const TextInput = ({ label, error, hint, required, className, ...p }) => (
  <Field label={label} error={error} hint={hint} required={required} className={className}><input className="input" required={required} {...p} value={p.value ?? ''} /></Field>
);

export const TextArea = ({ label, error, hint, className, rows = 3, ...p }) => (
  <Field label={label} error={error} hint={hint} className={className}><textarea className="input" rows={rows} {...p} value={p.value ?? ''} /></Field>
);

export function Select({ label, error, hint, options, placeholder, className, required, ...p }) {
  return (
    <Field label={label} error={error} hint={hint} className={className} required={required}>
      <select className="input" required={required} {...p} value={p.value ?? ''}>
        {placeholder !== false && <option value="">{placeholder ?? 'Select…'}</option>}
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : typeof o === 'object' ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o} value={o}>{humanize(o)}</option>))}
      </select>
    </Field>
  );
}

export const CountrySelect = (p) => <Select {...p} options={COUNTRIES.map(([c, n]) => [c, `${n} (${c})`])} placeholder={p.placeholder ?? 'Select country'} />;
export const TimezoneSelect = (p) => <Select {...p} options={TIMEZONES.map((t) => [t, t.replace(/_/g, ' ')])} placeholder={p.placeholder ?? 'Automatic'} />;
export const CurrencySelect = (p) => <Select {...p} options={CURRENCIES.map((c) => [c, c])} placeholder={p.placeholder ?? false} />;

export function Checkbox({ label, hint, ...p }) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink-700">
      <input type="checkbox" className="mt-0.5" {...p} checked={!!p.checked} />
      <span>{label}{hint && <span className="block text-xs text-ink-500">{hint}</span>}</span>
    </label>
  );
}

export function TagInput({ label, value = [], onChange, hint }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return (
    <Field label={label} hint={hint}>
      <div className="input flex flex-wrap items-center gap-1.5 py-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
            {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}><FiX /></button>
          </span>
        ))}
        <input className="min-w-[8rem] flex-1 border-0 p-0.5 text-sm focus:outline-none focus:ring-0" value={text} placeholder="Add tag and press Enter" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add} />
      </div>
    </Field>
  );
}

/** Generic form section driven by a field list: [{ name, label, type, options, required, span }] */
export function FormGrid({ fields, values, errors = {}, onChange }) {
  const set = (name) => (e) => onChange({ ...values, [name]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.filter(Boolean).map((f) => {
        const common = { key: f.name, label: f.label, required: f.required, error: errors[f.name], hint: f.hint, value: values[f.name], onChange: set(f.name), className: f.span === 2 ? 'sm:col-span-2' : '', placeholder: f.placeholder };
        if (f.render) return <div key={f.name} className={common.className}>{f.render(values, onChange)}</div>;
        if (f.type === 'select') return <Select {...common} options={f.options} />;
        if (f.type === 'country') return <CountrySelect {...common} />;
        if (f.type === 'timezone') return <TimezoneSelect {...common} />;
        if (f.type === 'currency') return <CurrencySelect {...common} />;
        if (f.type === 'textarea') return <TextArea {...common} rows={f.rows ?? 3} />;
        if (f.type === 'tags') return <div key={f.name} className="sm:col-span-2"><TagInput label={f.label} value={values[f.name] ?? []} onChange={set(f.name)} hint={f.hint} /></div>;
        if (f.type === 'checkbox') return <div key={f.name} className={common.className}><Checkbox label={f.label} hint={f.hint} checked={values[f.name]} onChange={set(f.name)} /></div>;
        return <TextInput {...common} type={f.type ?? 'text'} />;
      })}
    </div>
  );
}
