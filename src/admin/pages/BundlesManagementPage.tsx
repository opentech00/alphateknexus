import { useEffect, useState, useCallback } from 'react';
import {
  Package, Plus, Trash2, Edit3, Loader2, Check,
  Save, Tag, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ServiceBundle {
  id: string;
  name: string;
  description: string;
  slug: string;
  price_sle: number;
  original_price_sle: number;
  is_active: boolean;
  display_order: number;
  service_bundle_items: {
    id: string;
    quantity: number;
    service_id: string;
    services: { id: string; name: string; icon: string };
  }[];
}

interface Service {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

export function BundlesManagementPage() {
  const [bundles, setBundles] = useState<ServiceBundle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBundle, setEditingBundle] = useState<ServiceBundle | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const fetchBundles = useCallback(async () => {
    const { data } = await supabase
      .from('service_bundles')
      .select(`
        *,
        service_bundle_items (
          id, quantity, service_id,
          services ( id, name, icon )
        )
      `)
      .order('display_order', { ascending: true });
    setBundles((data as unknown as ServiceBundle[]) || []);
    setLoading(false);
  }, []);

  const fetchServices = useCallback(async () => {
    const { data } = await supabase
      .from('services')
      .select('id, name, slug, icon')
      .eq('is_active', true)
      .order('name');
    setServices(data || []);
  }, []);

  useEffect(() => {
    fetchBundles();
    fetchServices();
  }, [fetchBundles, fetchServices]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bundle? This cannot be undone.')) return;
    await supabase.from('service_bundles').delete().eq('id', id);
    fetchBundles();
  };

  const handleToggleActive = async (bundle: ServiceBundle) => {
    await supabase.from('service_bundles').update({ is_active: !bundle.is_active }).eq('id', bundle.id);
    fetchBundles();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (showEditor) {
    return (
      <BundleEditor
        bundle={editingBundle}
        services={services}
        onSave={() => { setShowEditor(false); setEditingBundle(null); fetchBundles(); }}
        onCancel={() => { setShowEditor(false); setEditingBundle(null); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Service Bundles</h1>
          <p className="text-sm text-slate-400 mt-0.5">Create multi-service packages at a discount</p>
        </div>
        <button
          onClick={() => { setEditingBundle(null); setShowEditor(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-900 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Bundle
        </button>
      </div>

      {bundles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-slate-300" />
          </div>
          <p className="font-semibold text-slate-700">No bundles yet</p>
          <p className="text-sm text-slate-400 mt-1">Create your first bundle to offer discounted multi-service packages.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bundles.map((bundle) => {
            const savings = bundle.original_price_sle - bundle.price_sle;
            const savingsPct = bundle.original_price_sle > 0 ? Math.round((savings / bundle.original_price_sle) * 100) : 0;
            return (
              <div key={bundle.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-500" />
                    <h3 className="font-bold text-slate-900">{bundle.name}</h3>
                    {savingsPct > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full">{savingsPct}% OFF</span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${bundle.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {bundle.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{bundle.description}</p>
                <div className="space-y-1.5 mb-4">
                  {bundle.service_bundle_items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      {item.services.name} {item.quantity > 1 && <span className="text-slate-400">x{item.quantity}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-xl font-bold text-slate-900">SLE {bundle.price_sle.toFixed(2)}</span>
                  {savings > 0 && <span className="text-sm text-slate-400 line-through">SLE {bundle.original_price_sle.toFixed(2)}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingBundle(bundle); setShowEditor(true); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => handleToggleActive(bundle)} className="flex-1 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                    {bundle.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => handleDelete(bundle.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BundleEditor({
  bundle, services, onSave, onCancel,
}: {
  bundle: ServiceBundle | null;
  services: Service[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(bundle?.name || '');
  const [description, setDescription] = useState(bundle?.description || '');
  const [slug, setSlug] = useState(bundle?.slug || '');
  const [price, setPrice] = useState(bundle?.price_sle?.toString() || '');
  const [originalPrice, setOriginalPrice] = useState(bundle?.original_price_sle?.toString() || '');
  const [displayOrder, setDisplayOrder] = useState(bundle?.display_order?.toString() || '0');
  const [items, setItems] = useState<{ service_id: string; quantity: number }[]>(
    bundle?.service_bundle_items?.map((i) => ({ service_id: i.service_id, quantity: i.quantity })) || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addItem = () => setItems([...items, { service_id: services[0]?.id || '', quantity: 1 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: 'service_id' | 'quantity', value: string | number) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: field === 'quantity' ? Number(value) : value } : item));
  };

  const handleSave = async () => {
    if (!name || !slug || !price || items.length === 0) {
      setError('Name, slug, price, and at least one service are required');
      return;
    }
    setSaving(true);
    setError('');

    const bundleData = {
      name,
      description,
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      price_sle: parseFloat(price),
      original_price_sle: parseFloat(originalPrice) || parseFloat(price),
      display_order: parseInt(displayOrder) || 0,
      is_active: true,
    };

    let bundleId = bundle?.id;

    if (bundle) {
      const { error: updateErr } = await supabase.from('service_bundles').update(bundleData).eq('id', bundle.id);
      if (updateErr) { setError(updateErr.message); setSaving(false); return; }
      await supabase.from('service_bundle_items').delete().eq('bundle_id', bundle.id);
    } else {
      const { data: newBundle, error: insertErr } = await supabase.from('service_bundles').insert(bundleData).select().single();
      if (insertErr) { setError(insertErr.message); setSaving(false); return; }
      bundleId = newBundle.id;
    }

    if (bundleId && items.length > 0) {
      const { error: itemsErr } = await supabase.from('service_bundle_items').insert(
        items.map((item) => ({ bundle_id: bundleId, service_id: item.service_id, quantity: item.quantity }))
      );
      if (itemsErr) { setError(itemsErr.message); setSaving(false); return; }
    }

    setSaving(false);
    onSave();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onCancel} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to bundles
      </button>

      <h1 className="text-xl font-bold text-slate-900">{bundle ? 'Edit Bundle' : 'New Bundle'}</h1>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Bundle Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office Care Plus" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="A complete office cleaning and security package" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Price (SLE)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="450.00" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Original Price (SLE)</label>
            <input type="number" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="550.00" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="office-care-plus" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Display Order</label>
            <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} placeholder="0" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Included Services</h3>
          <button onClick={addItem} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Service
          </button>
        </div>
        <div className="space-y-2.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select value={item.service_id} onChange={(e) => updateItem(idx, 'service_id', e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                {services.map((svc) => (
                  <option key={svc.id} value={svc.id}>{svc.name}</option>
                ))}
              </select>
              <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="w-16 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-center" />
              <button onClick={() => removeItem(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No services added yet.</p>}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Bundle</>}
        </button>
      </div>
    </div>
  );
}
