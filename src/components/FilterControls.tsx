import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type FilterInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
};

export function FilterInput({ label, icon, className = '', ...props }: FilterInputProps) {
  return (
    <div className="relative w-full">
      {icon && (
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25">
          {icon}
        </span>
      )}
      <input
        {...props}
        aria-label={props['aria-label'] || label}
        className={
          'w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-xs text-white outline-none transition placeholder:text-white/20 focus:border-white/30 focus:ring-1 focus:ring-white/10 ' +
          (icon ? 'pl-9 pr-3' : 'px-3') +
          ' ' +
          className
        }
      />
    </div>
  );
}

type FilterSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
};

export function FilterSelect({ label, children, className = '', ...props }: FilterSelectProps) {
  return (
    <select
      {...props}
      aria-label={props['aria-label'] || label}
      className={
        'rounded-lg border border-white/10 bg-[#101318] px-3 py-2.5 text-xs text-white/70 outline-none transition focus:border-white/30 focus:ring-1 focus:ring-white/10 ' +
        className
      }
    >
      {children}
    </select>
  );
}

export function FilterBar({ children, resultCount, totalCount, onClear, clearLabel = 'Clear filters' }: {
  children: ReactNode;
  resultCount?: number;
  totalCount?: number;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/[.02] p-3" role="group" aria-label="Table filters">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">{children}</div>
      {(resultCount != null || onClear) && (
        <div className="flex items-center gap-2 shrink-0">
          {resultCount != null && <span className="text-[9px] font-mono text-white/35" aria-live="polite">{totalCount != null ? resultCount + ' of ' + totalCount : resultCount + ' results'}</span>}
          {onClear && <button type="button" onClick={onClear} className="min-h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-[9px] font-mono uppercase tracking-wider text-white/55 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50">{clearLabel}</button>}
        </div>
      )}
    </div>
  );
}
