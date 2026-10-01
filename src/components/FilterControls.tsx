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
