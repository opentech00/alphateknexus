import { useEffect, useState, useCallback } from 'react';
import {
  Landmark, Plus, X, Loader2, CheckCircle2, RefreshCw, Trash2, Edit3,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface FxRate {
  id: string;
  currency_code: string;
  currency_name: string;
  symbol: string;
  rate_to_sle: number;
  is_active: boolean;
  updated_by: string;
  updated_at: string;
}

function fmtRate(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function FxRatesTab() {
  const [rates, setRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FxRate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('fx_rates')
      .select('*')
      .order('rate_to_sle', { ascending: true });
    if (error) { setLoadError(error.message); setRates([]); setLoading(false); return; }
    setRates((data || []) as FxRate[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleActive = async (rate: FxRate) => {
    await supabase.from('fx_rates').update({ is_active: !rate.is_active }).eq('id', rate.id);
    load();
  };

  const handleDelete = async (rate: FxRate) => {
    if (rate.currency_code === 'SLE') { alert('Cannot delete the base currency (SLE)'); return; }
    if (!confirm(`Delete ${rate.currency_code}? This removes the exchange rate.`)) return;
    await supabase.from('fx_rates').delete().eq('id', rate.id);
    load();
  };

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load FX rates: {loadError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Manage exchange rates. Rates are stored as <span className="font-semibold text-slate-700">1 unit = X SLE</span>.
          Active rates are visible to clients for currency conversion.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm whitespace-nowrap">
            <Plus className="w-4 h-4" /> Add Currency
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Currency</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Code</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Symbol</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Rate (to SLE)</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden md:table-cell">Updated</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rates.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-800">{r.currency_name}</td>
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-600">{r.currency_code}</td>
                    <td className="px-5 py-3 text-slate-600">{r.symbol || '-'}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtRate(r.rate_to_sle)}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleToggleActive(r)}
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          r.is_active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{new Date(r.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => { setEditing(r); setShowModal(true); }} title="Edit"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {r.currency_code !== 'SLE' && (
                          <button onClick={() => handleDelete(r)} title="Delete"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <FxRateModal
          editing={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </>
  );
}

function FxRateModal({ editing, onClose, onSaved }: {
  editing: FxRate | null; onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState(editing?.currency_code || '');
  const [name, setName] = useState(editing?.currency_name || '');
  const [symbol, setSymbol] = useState(editing?.symbol || '');
  const [rate, setRate] = useState(editing ? String(editing.rate_to_sle) : '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim() || !name.trim() || !rate) { setError('Fill all required fields'); return; }
    if (parseFloat(rate) <= 0) { setError('Rate must be greater than 0'); return; }
    setSubmitting(true);

    const payload = {
      currency_code: code.toUpperCase().trim(),
      currency_name: name.trim(),
      symbol: symbol.trim(),
      rate_to_sle: parseFloat(rate),
      is_active: isActive,
      updated_by: 'admin',
    };

    if (editing) {
      const { error: err } = await supabase.from('fx_rates').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); setSubmitting(false); return; }
    } else {
      const { error: err } = await supabase.from('fx_rates').insert(payload);
      if (err) { setError(err.message); setSubmitting(false); return; }
    }
    setSubmitting(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Currency' : 'Add Currency'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Currency Code *</label>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="USD" maxLength={4}
                  disabled={!!editing}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase disabled:bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Symbol</label>
                <input type="text" value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="$"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Currency Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="US Dollar"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Rate to SLE *</label>
              <input type="number" step="0.0001" min="0.0001" value={rate} onChange={e => setRate(e.target.value)} placeholder="24.5000"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              <p className="mt-1 text-xs text-slate-400">1 {code || 'XXX'} = ? SLE</p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm text-slate-700">Active (visible to clients)</span>
            </label>

            <button type="submit" disabled={submitting}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {submitting ? 'Saving…' : (editing ? 'Update Rate' : 'Add Currency')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
