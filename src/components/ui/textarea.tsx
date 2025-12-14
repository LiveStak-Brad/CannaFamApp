type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export function Textarea({ label, hint, className, ...rest }: Props) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-[color:var(--foreground)]">
        {label}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div>
      ) : null}
      <textarea
        className={
          "mt-2 w-full min-h-28 rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]" +
          (className ? ` ${className}` : "")
        }
        {...rest}
      />
    </label>
  );
}
