export function Card({
  title,
  children,
  footer,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      {title ? (
        <div className="px-5 pt-5">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
      ) : null}
      <div className={title ? "px-5 pb-5 pt-4" : "p-5"}>{children}</div>
      {footer ? (
        <div className="border-t border-[color:var(--border)] px-5 py-4">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
