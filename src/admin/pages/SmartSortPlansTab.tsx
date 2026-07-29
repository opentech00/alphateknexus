import { useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, X, Check, GripVertical, Tag, Sparkles, Power,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Plan {
  id: string;
  name: string;
  subtitle: string | null;
  price_sle: number;
  bin_size_liters: number;
  frequency: string;
  features: string[] | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const FREQUENCIES = [
  { id: 'daily', label: 'Daily' },
  { id: 'twice-weekly', label: 'Twice Weekly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'bi-weekly', label: 'Bi-Weekly' },
  { id: 'three-weeks', label: 'Every Three Weeks' },
  { id: 'monthly', label: 'Monthly' },
];

const BIN_SIZES = [25, 50, 120, 250, 350, 600, 1000];

const emptyDraft = {
  name: '',
  subtitle: '',
  price_sle: 15,
  bin_size_liters: 25,
  frequency: 'weekly',
  features: [''] as string[],
  is_active: true,
};

export function SmartSortPlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<typeof emptyDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('smart_sort_plans')
      .select('*')
      .order('sort_order', { ascending: true });
    setPlans((data as Plan[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setError('');
    setCreating(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setDraft({
      name: plan.name,
      subtitle: plan.subtitle || '',
      price_sle: plan.price_sle,
      bin_size_liters: plan.bin_size_liters,
      frequency: plan.frequency,
      features: plan.features?.length ? plan.features : [''],
      is_active: plan.is_active,
    });
    setError('');
    setCreating(true);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setError('');
  };

  const updateFeature = (idx: number, val: string) => {
    setDraft(prev => ({
      ...prev,
      features: prev.features.map((f, i) => (i === idx ? val : f)),
    }));
  };

  const addFeature = () => {
    setDraft(prev => ({ ...prev, features: [...prev.features, ''] }));
  };

  const removeFeature = (idx: number) => {
    setDraft(prev => ({ ...prev, features: prev.features.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError('Plan name is required.');
      return;
    }
    if (draft.price_sle < 0) {
      setError('Price cannot be negative.');
      return;
    }
    const cleanedFeatures = draft.features.map(f => f.trim()).filter(Boolean);
    setSaving(true);
    setError('');
    const payload = {
      name: draft.name.trim(),
      subtitle: draft.subtitle.trim() || null,
      price_sle: draft.price_sle,
      bin_size_liters: draft.bin_size_liters,
      frequency: draft.frequency,
      features: cleanedFeatures,
      is_active: draft.is_active,
      sort_order: editing?.sort_order ?? (plans.length + 1),
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error: err } = await supabase.from('smart_sort_plans').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('smart_sort_plans').insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    closeForm();
    load();
  };

  const toggleActive = async (plan: Plan) => {
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: !p.is_active } : p));
    await supabase.from('smart_sort_plans').update({ is_active: !plan.is_active, updated_at: new Date().toISOString() }).eq('id', plan.id);
  };

  const deletePlan = async (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"? Existing subscriptions keep their stored plan name.`)) return;
    setPlans(prev => prev.filter(p => p.id !== plan.id));
    await supabase.from('smart_sort_plans').delete().eq('id', plan.id);
  };

  const movePlan = async (plan: Plan, dir: -1 | 1) => {
    const sorted = [...plans].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(p => p.id === plan.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      supabase.from('smart_sort_plans').update({ sort_order: swapWith.sort_order, updated_at: new Date().toISOString() }).eq('id', plan.id),
      supabase.from('smart_sort_plans').update({ sort_order: plan.sort_order, updated_at: new Date().toISOString() }).eq('id', swapWith.id),
    ]);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pricing Plans</h2>
          <p className="text-sm text-slate-500">Manage subscription tiers shown to clients on the Smart Sort portal.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Tag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No pricing plans yet</p>
          <p className="text-sm text-slate-400 mt-1">Create your first plan to start offering subscriptions.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan, i) => {
            const features = plan.features || [];
            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition-all ${
                  plan.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-4.5 h-4.5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 leading-tight">{plan.name}</h3>
                      {plan.subtitle && <p className="text-xs text-slate-500">{plan.subtitle}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => movePlan(plan, -1)}
                      disabled={i === 0}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                      title="Move up"
                    >
                      <GripVertical className="w-4 h-4 text-slate-400 rotate-180" />
                    </button>
                    <button
                      onClick={() => movePlan(plan, 1)}
                      disabled={i === plans.length - 1}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                      title="Move down"
                    >
                      <GripVertical className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-bold text-slate-900">SLE {plan.price_sle}</span>
                  <span className="text-sm text-slate-400">/month</span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">{plan.bin_size_liters}L bin</span>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">{plan.frequency}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${plan.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {plan.is_active ? 'Active' : 'Hidden'}
                  </span>
                </div>

                {features.length > 0 && (
                  <ul className="space-y-1.5 mb-4">
                    {features.map((f, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => openEdit(plan)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => toggleActive(plan)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      plan.is_active
                        ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100'
                        : 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" /> {plan.is_active ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={() => deletePlan(plan)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plan Editor Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Plan' : 'New Plan'}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Plan Name *</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Basic Weekly"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Subtitle</label>
                <input
                  type="text"
                  value={draft.subtitle}
                  onChange={e => setDraft({ ...draft, subtitle: e.target.value })}
                  placeholder="Short marketing tagline"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Price (SLE/mo)</label>
                  <input
                    type="number"
                    min={0}
                    value={draft.price_sle}
                    onChange={e => setDraft({ ...draft, price_sle: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Bin Size (L)</label>
                  <select
                    value={draft.bin_size_liters}
                    onChange={e => setDraft({ ...draft, bin_size_liters: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  >
                    {BIN_SIZES.map(b => <option key={b} value={b}>{b}L</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Frequency</label>
                <select
                  value={draft.frequency}
                  onChange={e => setDraft({ ...draft, frequency: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                >
                  {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">Features</label>
                <div className="space-y-2">
                  {draft.features.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={f}
                        onChange={e => updateFeature(idx, e.target.value)}
                        placeholder={`Feature ${idx + 1}`}
                        className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                      {draft.features.length > 1 && (
                        <button
                          onClick={() => removeFeature(idx)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addFeature}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add feature
                </button>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, is_active: !draft.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    draft.is_active ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${draft.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-slate-700">Visible to clients</span>
              </label>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0 flex gap-3">
              <button
                onClick={closeForm}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
