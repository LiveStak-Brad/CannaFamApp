import Link from "next/link";
import Image from "next/image";

export function TopNav({
  right,
}: {
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-[color:var(--card)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:py-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="relative h-7 w-7 overflow-hidden rounded-lg sm:h-8 sm:w-8">
            <Image src="/applogo.png" alt="CannaFam" fill sizes="32px" className="object-cover" />
          </div>
          <div className="leading-tight">
            <div className="text-xs font-semibold sm:text-sm">CannaFam</div>
            <div className="text-[11px] text-[color:var(--muted)] sm:text-xs">CFM</div>
          </div>
        </Link>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-2">
          {right}
        </div>
      </div>
    </header>
  );
}
