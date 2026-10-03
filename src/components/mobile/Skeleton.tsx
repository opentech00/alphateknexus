interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

/** Skeleton placeholder for a service grid card (2-col layout) */
export function ServiceCardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <Skeleton className="rounded-none h-20 w-full" />
      <div className="px-3 pt-2.5 pb-3 flex flex-col items-center gap-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
        <Skeleton className="h-3.5 w-3.5 mt-0.5 rounded-full" />
      </div>
    </div>
  );
}

/** Skeleton placeholder for a booking card with image banner */
export function BookingCardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-3">
      <div className="flex gap-3">
        <Skeleton className="w-[72px] h-[72px] rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2 pt-0.5">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <Skeleton className="mt-2.5 h-12 w-full rounded-xl" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
      </div>
    </div>
  );
}

/** Skeleton for the horizontal booking mini-cards on home */
export function BookingMiniSkeleton() {
  return (
    <div className="flex-shrink-0 w-56 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-3.5 space-y-2">
      <div className="flex justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-2.5 w-32" />
    </div>
  );
}
