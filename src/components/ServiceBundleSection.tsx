import { useEffect, useState } from 'react';
import {
  Package, Check, ArrowRight, Loader2, Sparkles, Tag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Bundle {
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
    services: { id: string; name: string; icon: string; slug: string };
  }[];
}

interface ServiceBundleSectionProps {
  onSelectBundle: (bundle: Bundle) => void;
}

export function ServiceBundleSection({ onSelectBundle }: ServiceBundleSectionProps) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('service_bundles')
        .select(`
          *,
          service_bundle_items (
            id,
            quantity,
            services ( id, name, icon, slug )
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      setBundles((data as unknown as Bundle[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
      </div>
    );
  }

  if (bundles.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
          <Package className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Bundle & Save</h2>
          <p className="text-xs text-slate-400">Multi-service packages at a discount</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bundles.map((bundle) => {
          const savings = bundle.original_price_sle - bundle.price_sle;
          const savingsPct = bundle.original_price_sle > 0 ? Math.round((savings / bundle.original_price_sle) * 100) : 0;
          return (
            <div
              key={bundle.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-emerald-200 transition-all duration-300 group flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-slate-900">{bundle.name}</h3>
                </div>
                {savingsPct > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full">
                    <Tag className="w-3 h-3" />
                    {savingsPct}% OFF
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-500 mb-4 line-clamp-2">{bundle.description}</p>

              <div className="space-y-2 mb-4 flex-1">
                {bundle.service_bundle_items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm text-slate-600">
                    <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="flex-1">{item.services.name}</span>
                    {item.quantity > 1 && (
                      <span className="text-xs text-slate-400">x{item.quantity}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-2xl font-bold text-slate-900">
                  SLE {bundle.price_sle.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {savings > 0 && (
                  <span className="text-sm text-slate-400 line-through">
                    SLE {bundle.original_price_sle.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>

              <button
                onClick={() => onSelectBundle(bundle)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-all hover:shadow-lg active:scale-[0.98] text-sm"
              >
                Get Bundle <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export type { Bundle };
