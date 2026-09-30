import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { searchHelp, type HelpHit } from '../../lib/knowledge';

export function KnowledgeSearch({
  placeholder = 'Search help — wallet, payments, bookings…',
  compact = false,
}: {
  placeholder?: string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<HelpHit[]>([]);
  const [mode, setMode] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (q: string) => {
    setLoading(true);
    const result = await searchHelp(q);
    setHits(result.hits);
    setMode(result.mode);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void run(query); }, query ? 280 : 0);
    return () => window.clearTimeout(t);
  }, [query, run]);

  return (
    <div className={compact ? '' : 'mb-6'}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
        ) : mode === 'semantic' ? (
          <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
        ) : null}
      </div>
      {hits.length > 0 && (
        <ul className="mt-3 space-y-2">
          {hits.map((hit) => {
            const expanded = open === hit.article_id;
            return (
              <li key={hit.article_id}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : hit.article_id)}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-emerald-200 hover:shadow-sm transition-all"
                >
                  <p className="text-sm font-semibold text-slate-900">{hit.title}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {expanded ? hit.excerpt : `${hit.excerpt.slice(0, 110)}${hit.excerpt.length > 110 ? '…' : ''}`}
                  </p>
                  <span className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {hit.category}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {query.trim().length >= 2 && !loading && hits.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No matching help articles. Open a ticket below.</p>
      )}
    </div>
  );
}
