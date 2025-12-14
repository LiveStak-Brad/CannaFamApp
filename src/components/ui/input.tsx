type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Input({ label, hint, className, ...rest }: Props) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-[color:var(--foreground)]">
        {label}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div>
      ) : null}
      <input
        className={
          "mt-2 w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]" +
          (className ? ` ${className}` : "")
        }
        {...rest}
      />
    </label>
  );
}
