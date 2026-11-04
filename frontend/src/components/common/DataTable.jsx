// Responsive table: horizontal scroll on small screens, sortable headers, row selection.
import { FiChevronUp, FiChevronDown } from 'react-icons/fi';
import { Loading, EmptyState, ErrorState, Pagination } from './ui';

export default function DataTable({ columns, rows, loading, error, onRetry, meta, onPage, sort, onSort, selectable, selected = [], onSelect, onRowClick, empty, rowKey = (r) => r.id }) {
  const allChecked = rows?.length > 0 && rows.every((r) => selected.includes(rowKey(r)));
  const toggleAll = () => onSelect(allChecked ? selected.filter((id) => !rows.some((r) => rowKey(r) === id)) : [...new Set([...selected, ...rows.map(rowKey)])]);
  const toggle = (id) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-200">
          <thead className="bg-ink-50">
            <tr>
              {selectable && <th className="th w-10"><input type="checkbox" aria-label="Select all" checked={allChecked} onChange={toggleAll} /></th>}
              {columns.map((c) => {
                const active = sort && (sort === c.sort || sort === `-${c.sort}`);
                return (
                  <th key={c.key} className={`th ${c.className ?? ''}`}>
                    {c.sort && onSort ? (
                      <button className="inline-flex items-center gap-1 uppercase" onClick={() => onSort(sort === c.sort ? `-${c.sort}` : c.sort)}>
                        {c.header}{active && (sort.startsWith('-') ? <FiChevronDown /> : <FiChevronUp />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {!loading && !error && rows?.map((r) => (
              <tr key={rowKey(r)} className={onRowClick ? 'cursor-pointer hover:bg-ink-50' : ''} onClick={() => onRowClick?.(r)}>
                {selectable && <td className="td w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={selected.includes(rowKey(r))} onChange={() => toggle(rowKey(r))} /></td>}
                {columns.map((c) => <td key={c.key} className={`td ${c.className ?? ''}`}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={onRetry} />}
      {!loading && !error && rows?.length === 0 && (empty ?? <EmptyState title="Nothing here yet" />)}
      {!loading && !error && rows?.length > 0 && <Pagination meta={meta} onPage={onPage} />}
    </div>
  );
}
