import { useMemo, useState, type ReactNode } from 'react';

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  accessor: (row: T) => unknown;
  type?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime';
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => ReactNode;
  className?: string;
};

type Props<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  loading?: boolean;
  error?: ReactNode;
  className?: string;
  initialSort?: { key: string; direction?: 'asc' | 'desc' };
  onRow?: (row: T) => void;
};

function compare(a: unknown, b: unknown, type: DataTableColumn<any>['type'] = 'text') {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (type === 'number' || type === 'currency' || type === 'percent') {
    const av = Number(a); const bv = Number(b);
    if (Number.isFinite(av) && Number.isFinite(bv)) return av - bv;
  }
  if (type === 'date' || type === 'datetime') {
    const at = new Date(String(a)).getTime(); const bt = new Date(String(b)).getTime();
    if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export default function DataTable<T>({
  rows, columns, rowKey, empty = 'No results.', loading = false, error, className = '', initialSort, onRow,
}: Props<T>) {
  const [sort, setSort] = useState(initialSort ? { key: initialSort.key, direction: initialSort.direction || 'asc' } : null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find(item => item.key === sort.key);
    if (!column) return rows;
    return [...rows].sort((a, b) => compare(column.accessor(a), column.accessor(b), column.type) * (sort.direction === 'desc' ? -1 : 1));
  }, [rows, columns, sort]);

  const align = (value?: DataTableColumn<T>['align']) =>
    value === 'right' ? 'text-right' : value === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={'rounded-2xl border border-white/10 bg-[#15181E] overflow-hidden ' + className}>
      <div className="overflow-x-auto overscroll-x-contain" role="region" aria-label="Data table" tabIndex={0}>
        <table className="w-full min-w-max text-[10px] font-mono">
          <thead className="sticky top-0 z-10 bg-[#15181E] text-white/45 uppercase tracking-wider">
            <tr>
              {columns.map(column => {
                const active = sort?.key === column.key;
                return (
                  <th key={column.key} scope="col" className={'p-3 whitespace-nowrap ' + align(column.align) + ' ' + (column.className || '')}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 min-h-8 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 rounded"
                      aria-label={'Sort by ' + String(column.header)}
                      aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      onClick={() => setSort(active ? { key: column.key, direction: sort?.direction === 'asc' ? 'desc' : 'asc' } : { key: column.key, direction: 'asc' })}
                    >
                      {column.header}
                      <span aria-hidden="true">{active ? (sort?.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={columns.length} className="p-8 text-center text-white/35">Loading…</td></tr>
              : error ? <tr><td colSpan={columns.length} className="p-8 text-center text-rose-200">{error}</td></tr>
              : sorted.length ? sorted.map((row, index) => (
                <tr key={rowKey(row, index)} onClick={() => onRow?.(row)} className={'border-t border-white/5 align-top ' + (onRow ? 'cursor-pointer hover:bg-white/[.02]' : '')}>
                  {columns.map(column => <td key={column.key} className={'p-3 ' + align(column.align) + ' ' + (column.className || '')}>{column.render ? column.render(row) : String(column.accessor(row) ?? '—')}</td>)}
                </tr>
              )) : <tr><td colSpan={columns.length} className="p-8 text-center text-white/35">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
