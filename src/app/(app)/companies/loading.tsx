export default function CompaniesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your companies…</span>
      <div aria-hidden className="flex flex-col gap-2">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-line" />
        <div className="h-4 w-full max-w-[560px] animate-pulse rounded bg-line-soft" />
      </div>
      <div aria-hidden className="h-[86px] animate-pulse rounded-[14px] border border-line bg-white" />
      <ul aria-hidden className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4">
        {[0, 1, 2, 3].map((index) => (
          <li key={index} className="flex h-[212px] flex-col gap-4 rounded-[14px] border border-line bg-white p-5">
            <div className="flex gap-3.5">
              <div className="size-14 animate-pulse rounded-xl bg-line-soft" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <div className="h-4 w-3/5 animate-pulse rounded bg-line" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-line-soft" />
              </div>
            </div>
            <div className="h-10 animate-pulse rounded bg-line-soft" />
          </li>
        ))}
      </ul>
    </div>
  );
}
