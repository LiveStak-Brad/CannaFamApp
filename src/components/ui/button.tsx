import Link from "next/link";

type CommonProps = {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
};

type ButtonProps = CommonProps &
  (
    | ({ as?: "button" } & React.ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ as: "link"; href: string; target?: string } & Omit<
        React.AnchorHTMLAttributes<HTMLAnchorElement>,
        "href"
      >)
  );

export function Button(props: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition active:translate-y-[1px] disabled:opacity-60 disabled:cursor-not-allowed";
  const primary =
    "bg-[color:var(--accent)] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_0_18px_rgba(209,31,42,0.18),0_0_14px_rgba(25,192,96,0.06)] hover:bg-[color:var(--accent-2)]";
  const secondary =
    "bg-[color:var(--card)] text-[color:var(--foreground)] border border-[color:var(--border)] hover:border-[rgba(209,31,42,0.45)]";

  const variant = props.variant ?? "primary";
  const cls =
    base +
    " " +
    (variant === "secondary" ? secondary : primary) +
    (props.className ? ` ${props.className}` : "");

  if (props.as === "link") {
    const { as, href, children, className, variant: _variant, ...rest } = props;
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }

  const { as, children, className, variant: _variant, ...rest } = props as {
    as?: "button";
  } & React.ButtonHTMLAttributes<HTMLButtonElement> &
    CommonProps;
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
