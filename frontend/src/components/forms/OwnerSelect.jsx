import { useSalesIdStore } from '../../store/salesIdStore';
import { Select } from './fields';

/** Shown on create forms when "All Sales IDs" is selected: which Sales ID owns the new record. */
export default function OwnerSelect({ value, onChange, error }) {
  const { selected, options } = useSalesIdStore();
  if (selected !== 'all') return null;
  return <Select label="Sales ID" required value={value} onChange={(e) => onChange(e.target.value)} error={error} options={options.filter((o) => o.status === 'ACTIVE').map((o) => [o.id, `${o.code} · ${o.name}`])} />;
}
