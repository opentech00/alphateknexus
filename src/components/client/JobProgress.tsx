const STEPS = [
  { key: 'pending', label: 'Submitted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'On the job' },
  { key: 'completed', label: 'Done' },
] as const;

const STATUS_INDEX: Record<string, number> = {
  pending: 0,
  pending_review: 0,
  approved: 1,
  confirmed: 1,
  in_progress: 2,
  completed: 3,
};

export function JobProgress({ status, compact = false }: { status: string; compact?: boolean }) {
  if (status === 'cancelled') {
    return (
      <p className={`font-semibold text-red-600 ${compact ? 'text-[10px]' : 'text-xs'}`}>Cancelled</p>
    );
  }
  const idx = STATUS_INDEX[status] ?? 0;
  return (
    <div className={compact ? 'pt-1' : ''} aria-label={`Job progress: ${STEPS[idx]?.label || status}`}>
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = i <= idx;
          const active = i === idx;
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div
                className={`rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  compact ? 'w-2.5 h-2.5' : 'w-6 h-6'
                } ${
                  active ? 'bg-emerald-600 border-emerald-600'
                    : done ? 'bg-emerald-100 border-emerald-400'
                      : 'bg-white border-slate-200'
                }`}
              />
              {i < STEPS.length - 1 && (
                <div className={`flex-1 ${compact ? 'h-0.5' : 'h-0.5'} ${i < idx ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="flex justify-between mt-1.5">
          {STEPS.map((s) => (
            <p key={s.key} className="text-[10px] text-slate-400">{s.label}</p>
          ))}
        </div>
      )}
    </div>
  );
}
