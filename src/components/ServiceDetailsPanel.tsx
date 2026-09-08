import { FileText } from 'lucide-react';

type DetailsRecord = Record<string, unknown>;

interface Props {
  details: DetailsRecord | null | undefined;
  notes?: string | null;
  serviceName?: string;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  location?: string | null;
  submittedAt?: string | null;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function isPrimitive(v: unknown): v is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof v);
}

function formatPrimitive(key: string, value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (key.includes('price') || key.includes('amount') || key.includes('cost') || key.endsWith('_sle')) {
      return `Le ${value.toLocaleString()}`;
    }
    return value.toLocaleString();
  }
  return value;
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length === 0;
  return false;
}

function PrimitiveRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-slate-800 font-medium text-right break-words max-w-[70%]">{value}</span>
    </div>
  );
}

function ChipsRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="py-2 border-b border-slate-100 last:border-0">
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function ObjectBlock({ title, obj }: { title: string; obj: Record<string, unknown> }) {
  const entries = Object.entries(obj).filter(([, val]) => !isBlank(val));
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-700 mb-2">{title}</p>
      <div>
        {entries.map(([k, v]) => {
          if (isPrimitive(v)) {
            return <PrimitiveRow key={k} label={humanizeKey(k)} value={formatPrimitive(k, v)} />;
          }
          if (Array.isArray(v) && v.every(isPrimitive)) {
            return <ChipsRow key={k} label={humanizeKey(k)} values={v.map((x) => formatPrimitive(k, x))} />;
          }
          return (
            <div key={k} className="py-2 border-b border-slate-100 last:border-0">
              <p className="text-xs text-slate-500 mb-1">{humanizeKey(k)}</p>
              <pre className="text-[11px] text-slate-700 bg-slate-50 rounded p-2 overflow-auto whitespace-pre-wrap break-words">
                {JSON.stringify(v, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ServiceDetailsPanel({
  details,
  notes,
  serviceName,
  clientName,
  clientPhone,
  clientEmail,
  scheduledDate,
  scheduledTime,
  location,
  submittedAt,
}: Props) {
  const hiddenKeys = new Set(['quote_request']);
  const entries = Object.entries(details || {}).filter(([k, v]) => !hiddenKeys.has(k) && !isBlank(v));
  const primitiveRows = entries.filter(([, v]) => isPrimitive(v));
  const listRows = entries.filter(([, v]) => Array.isArray(v));
  const objectRows = entries.filter(([, v]) => typeof v === 'object' && v !== null && !Array.isArray(v));
  const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
  const hasSnapshot = [clientName, clientPhone, clientEmail, scheduledDate, scheduledTime, location, submittedAt]
    .some((v) => typeof v === 'string' && v.trim().length > 0);

  if (entries.length === 0 && !hasNotes && !hasSnapshot) {
    return <p className="text-sm text-slate-500">No submitted details for this request yet.</p>;
  }

  const fmt = (dateLike: string | null | undefined) => {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return dateLike;
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold text-slate-700 mb-2">Client & Booking Snapshot</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
          {clientName ? <PrimitiveRow label="Client Name" value={clientName} /> : null}
          {clientPhone ? <PrimitiveRow label="Phone" value={clientPhone} /> : null}
          {clientEmail ? <PrimitiveRow label="Email" value={clientEmail} /> : null}
          {location ? <PrimitiveRow label="Location" value={location} /> : null}
          {fmt(scheduledDate) ? <PrimitiveRow label="Scheduled Date" value={fmt(scheduledDate)!} /> : null}
          {scheduledTime ? <PrimitiveRow label="Scheduled Time" value={scheduledTime} /> : null}
          {fmt(submittedAt) ? <PrimitiveRow label="Submitted On" value={fmt(submittedAt)!} /> : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-slate-600" />
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Full Submitted Service Details{serviceName ? ` - ${serviceName}` : ''}
          </p>
        </div>
        {primitiveRows.map(([k, v]) => (
          <PrimitiveRow key={k} label={humanizeKey(k)} value={formatPrimitive(k, v as string | number | boolean)} />
        ))}
        {listRows.map(([k, v]) => {
          const arr = v as unknown[];
          if (arr.every(isPrimitive)) {
            return <ChipsRow key={k} label={humanizeKey(k)} values={arr.map((x) => formatPrimitive(k, x))} />;
          }
          if (arr.every((x) => typeof x === 'object' && x !== null)) {
            return (
              <div key={k} className="py-2 border-b border-slate-100 last:border-0">
                <p className="text-xs text-slate-500 mb-2">{humanizeKey(k)}</p>
                <div className="space-y-2">
                  {arr.map((x, idx) => (
                    <ObjectBlock key={`${k}-${idx}`} title={`${humanizeKey(k)} ${idx + 1}`} obj={x as Record<string, unknown>} />
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={k} className="py-2 border-b border-slate-100 last:border-0">
              <p className="text-xs text-slate-500 mb-1">{humanizeKey(k)}</p>
              <pre className="text-[11px] text-slate-700 bg-white rounded p-2 overflow-auto whitespace-pre-wrap break-words">
                {JSON.stringify(arr, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>

      {objectRows.length > 0 && (
        <div className="space-y-2">
          {objectRows.map(([k, v]) => (
            <ObjectBlock key={k} title={humanizeKey(k)} obj={v as Record<string, unknown>} />
          ))}
        </div>
      )}

      {hasNotes && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800 mb-1">Client Notes</p>
          <p className="text-xs text-amber-900 whitespace-pre-wrap break-words">{notes}</p>
        </div>
      )}
    </div>
  );
}
