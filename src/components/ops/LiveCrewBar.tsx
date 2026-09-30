import { Radio } from 'lucide-react';
import type { CrewPresence } from '../../lib/presence';
import { transformedMediaUrl } from '../../lib/storageUrls';

export function LiveCrewBar({
  peers,
  workerPhotos,
}: {
  peers: CrewPresence[];
  workerPhotos?: Record<string, string | null>;
}) {
  const field = peers.filter((p) => p.role === 'field');
  const dispatchers = peers.filter((p) => p.role === 'dispatch').length;

  return (
    <div className="mb-6 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-emerald-400 motion-safe:animate-ping opacity-60" />
          <span className="relative rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <Radio className="w-3.5 h-3.5" />
        {field.length} live in the field
        {dispatchers > 0 ? ` · ${dispatchers} dispatch` : ''}
      </span>
      <div className="flex -space-x-2 overflow-hidden">
        {field.slice(0, 8).map((p) => {
          const src = transformedMediaUrl(p.photoUrl || workerPhotos?.[p.employeeId] || '', 64);
          return src ? (
            <img
              key={p.employeeId}
              src={src}
              alt={p.name}
              title={p.name}
              className="w-8 h-8 rounded-full border-2 border-white object-cover"
            />
          ) : (
            <span
              key={p.employeeId}
              title={p.name}
              className="w-8 h-8 rounded-full border-2 border-white bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center justify-center"
            >
              {p.name?.[0]?.toUpperCase() || '?'}
            </span>
          );
        })}
      </div>
      {field.length === 0 && (
        <p className="text-xs text-slate-500">No field app is open right now. Crew appear here when they go live.</p>
      )}
    </div>
  );
}

export function LiveDot({ on, className = '' }: { on: boolean; className?: string }) {
  if (!on) return null;
  return (
    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white ${className}`} title="Live" />
  );
}
