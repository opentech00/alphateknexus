import { useEffect, useState, useCallback } from 'react';
import {
  Settings, Bell, Zap, Target, Loader2, CheckCircle2,
  AlertTriangle, CreditCard, Smartphone, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PaymentMethod {
  id: string;
  type: string;
  provider: string;
  label: string;
  detail: string;
  is_default: boolean;
}

interface WalletPrefs {
  low_balance_threshold: number;
  auto_topup_enabled: boolean;
  auto_topup_amount: number;
  auto_topup_method_id: string | null;
  monthly_budget: number;
}

const DEFAULT_PREFS: WalletPrefs = {
  low_balance_threshold: 100,
  auto_topup_enabled: false,
  auto_topup_amount: 200,
  auto_topup_method_id: null,
  monthly_budget: 0,
};

export function WalletSettings({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<WalletPrefs>(DEFAULT_PREFS);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [prefRes, methodRes] = await Promise.all([
      supabase.from('user_preferences').select('low_balance_threshold, auto_topup_enabled, auto_topup_amount, auto_topup_method_id, monthly_budget').eq('user_id', user.id).maybeSingle(),
      supabase.from('payment_methods').select('id, type, provider, label, detail, is_default').eq('user_id', user.id).order('is_default', { ascending: false }),
    ]);

    if (prefRes.data) {
      setPrefs({
        low_balance_threshold: prefRes.data.low_balance_threshold ?? 100,
        auto_topup_enabled: prefRes.data.auto_topup_enabled ?? false,
        auto_topup_amount: prefRes.data.auto_topup_amount ?? 200,
        auto_topup_method_id: prefRes.data.auto_topup_method_id ?? null,
        monthly_budget: prefRes.data.monthly_budget ?? 0,
      });
    }
    setMethods(methodRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      low_balance_threshold: prefs.low_balance_threshold,
      auto_topup_enabled: prefs.auto_topup_enabled,
      auto_topup_amount: prefs.auto_topup_amount,
      auto_topup_method_id: prefs.auto_topup_method_id,
      monthly_budget: prefs.monthly_budget,
    }, { onConflict: 'user_id' });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const thresholdPresets = [50, 100, 200, 500];
  const topupPresets = [100, 200, 500, 1000];
  const budgetPresets = [500, 1000, 2500, 5000];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Wallet Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
            {/* Low Balance Alert */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Bell className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Low Balance Alert</p>
                  <p className="text-xs text-slate-400">Get notified when your balance drops below a threshold</p>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">SLE</span>
                <input
                  type="number"
                  min="0"
                  value={prefs.low_balance_threshold}
                  onChange={e => setPrefs(p => ({ ...p, low_balance_threshold: Number(e.target.value) || 0 }))}
                  className="w-full pl-14 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {thresholdPresets.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPrefs(p => ({ ...p, low_balance_threshold: v }))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      prefs.low_balance_threshold === v
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Top-Up */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Auto Top-Up</p>
                    <p className="text-xs text-slate-400">Automatically top up when balance is low</p>
                  </div>
                </div>
                <button
                  onClick={() => setPrefs(p => ({ ...p, auto_topup_enabled: !p.auto_topup_enabled }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${prefs.auto_topup_enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${prefs.auto_topup_enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {prefs.auto_topup_enabled && (
                <div className="space-y-4 mt-4 pl-10">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Top-up amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">SLE</span>
                      <input
                        type="number"
                        min="10"
                        value={prefs.auto_topup_amount}
                        onChange={e => setPrefs(p => ({ ...p, auto_topup_amount: Number(e.target.value) || 0 }))}
                        className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      {topupPresets.map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPrefs(p => ({ ...p, auto_topup_amount: v }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            prefs.auto_topup_amount === v
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {methods.length > 0 ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment method</label>
                      <div className="space-y-2">
                        {methods.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPrefs(p => ({ ...p, auto_topup_method_id: m.id }))}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                              prefs.auto_topup_method_id === m.id
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.type === 'mobile' ? 'bg-blue-50' : 'bg-slate-50'}`}>
                              {m.type === 'mobile' ? <Smartphone className="w-4 h-4 text-blue-500" /> : <CreditCard className="w-4 h-4 text-slate-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">{m.label || m.provider}</p>
                              <p className="text-xs text-slate-400 truncate">{m.detail}</p>
                            </div>
                            {m.is_default && <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Default</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 rounded-xl p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">No saved payment methods. Add one in your Account settings to enable auto top-up.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Monthly Budget */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Target className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Monthly Budget</p>
                  <p className="text-xs text-slate-400">Set a spending target to track your wallet usage</p>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">SLE</span>
                <input
                  type="number"
                  min="0"
                  value={prefs.monthly_budget}
                  onChange={e => setPrefs(p => ({ ...p, monthly_budget: Number(e.target.value) || 0 }))}
                  placeholder="0 = no budget"
                  className="w-full pl-14 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {budgetPresets.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPrefs(p => ({ ...p, monthly_budget: v }))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      prefs.monthly_budget === v
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Set to 0 to disable budget tracking</p>
            </div>
          </div>
        )}

        <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle2 className="w-5 h-5" /> Saved!</>
            ) : (
              <><CheckCircle2 className="w-5 h-5" /> Save Settings</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
