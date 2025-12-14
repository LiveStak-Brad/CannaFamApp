export function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">{children}</div>
  );
}
