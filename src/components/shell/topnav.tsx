import Link from "next/link";
import Image from "next/image";

export function TopNav({
  right,
}: {
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-[rgba(7,10,8,0.80)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative h-8 w-8 overflow-hidden rounded-full">
            <Image src="/marketing.png" alt="CannaFam" fill sizes="32px" className="object-cover" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">CannaFam</div>
            <div className="text-xs text-[color:var(--muted)]">CFM</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
