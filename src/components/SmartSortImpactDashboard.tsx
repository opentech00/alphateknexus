import { useEffect, useMemo, useState } from 'react';
import {
  Leaf, Recycle, Trees, Award, TrendingUp, Trash2, Factory,
  Sparkles, Loader2, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Pickup {
  id: string;
  scheduled_date: string;
  status: string;
  waste_kg: number | null;
  diverted_kg: number | null;
  smart_sort_subscriptions: { waste_type: string } | null;
}

const DIVERSION_RATES: Record<string, number> = {
  recyclables: 1.0, organic: 1.0, ewaste: 1.0,
  construction: 0.8, bulk: 0.6, general: 0.0,
};

const CO2_FACTORS: Record<string, number> = {
  recyclables: 2.5, organic: 0.5, ewaste: 15.0,
  construction: 0.8, bulk: 1.0, general: 0.0,
};

const WASTE_LABELS: Record<string, string> = {
  general: 'General Waste', recyclables: 'Recyclables', organic: 'Organic / Green',
  construction: 'Construction', ewaste: 'E-Waste', bulk: 'Bulk Items',
};

const WASTE_COLORS: Record<string, string> = {
  general: '#94a3b8', recyclables: '#10b981', organic: '#84cc16',
  construction: '#f59e0b', ewaste: '#6366f1', bulk: '#ec4899',
};

interface Badge {
  id: string;
  label: string;
  desc: string;
  icon: typeof Leaf;
  threshold: number;
  unit: string;
  color: string;
  bg: string;
}

const BADGES: Badge[] = [
  { id: 'first-step', label: 'First Step', desc: 'First pickup completed', icon: Sparkles, threshold: 1, unit: 'pickup', color: 'text-teal-600', bg: 'bg-teal-50' },
  { id: 'eco-starter', label: 'Eco Starter', desc: '50 kg waste diverted', icon: Leaf, threshold: 50, unit: 'kg', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'green-hero', label: 'Green Hero', desc: '250 kg waste diverted', icon: Trees, threshold: 250, unit: 'kg', color: 'text-green-600', bg: 'bg-green-50' },
  { id: 'carbon-saver', label: 'Carbon Saver', desc: '500 kg CO2 saved', icon: Factory, threshold: 500, unit: 'kg', color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'recycling-champion', label: 'Recycling Champion', desc: '1,000 kg diverted', icon: Recycle, threshold: 1000, unit: 'kg', color: 'text-teal-700', bg: 'bg-teal-50' },
  { id: 'planet-guardian', label: 'Planet Guardian', desc: '2,500 kg diverted', icon: Award, threshold: 2500, unit: 'kg', color: 'text-amber-600', bg: 'bg-amber-50' },
];

export function SmartSortImpactDashboard() {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('smart_sort_pickups')
        .select('id, scheduled_date, status, waste_kg, diverted_kg, smart_sort_subscriptions(waste_type)')
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false });
      setPickups((data as unknown as Pickup[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const impact = useMemo(() => {
    let totalWaste = 0;
    let totalDiverted = 0;
    let totalCO2 = 0;
    const byType: Record<string, { waste: number; diverted: number; co2: number; count: number }> = {};

    pickups.forEach(p => {
      const wasteType = p.smart_sort_subscriptions?.waste_type || 'general';
      const wasteKg = p.waste_kg || 0;
      const divertedKg = p.diverted_kg ?? (wasteKg * (DIVERSION_RATES[wasteType] ?? 0));
      const co2Saved = divertedKg * (CO2_FACTORS[wasteType] ?? 0);

      totalWaste += wasteKg;
      totalDiverted += divertedKg;
      totalCO2 += co2Saved;

      if (!byType[wasteType]) byType[wasteType] = { waste: 0, diverted: 0, co2: 0, count: 0 };
      byType[wasteType].waste += wasteKg;
      byType[wasteType].diverted += divertedKg;
      byType[wasteType].co2 += co2Saved;
      byType[wasteType].count += 1;
    });

    const recyclingRate = totalWaste > 0 ? (totalDiverted / totalWaste) * 100 : 0;
    const treesEquivalent = totalCO2 / 21; // ~21 kg CO2 absorbed per tree per year
    const landfillSaved = totalDiverted; // kg not sent to landfill

    return { totalWaste, totalDiverted, totalCO2, recyclingRate, treesEquivalent, landfillSaved, byType, pickupCount: pickups.length };
  }, [pickups]);

  const earnedBadges = useMemo(() => {
    return BADGES.filter(b => {
      if (b.unit === 'pickup') return impact.pickupCount >= b.threshold;
      if (b.id === 'carbon-saver') return impact.totalCO2 >= b.threshold;
      return impact.totalDiverted >= b.threshold;
    });
  }, [impact]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
      </div>
    );
  }

  const hasData = impact.pickupCount > 0;

  return (
    <div className="space-y-5">
      {/* Hero Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Recycle}
          label="Waste Diverted"
          value={`${Math.round(impact.totalDiverted)} kg`}
          sub="from landfill"
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          icon={Factory}
          label="CO2 Saved"
          value={`${Math.round(impact.totalCO2)} kg`}
          sub="emissions avoided"
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          icon={Trees}
          label="Trees Equivalent"
          value={impact.treesEquivalent >= 1 ? `${Math.round(impact.treesEquivalent)}` : '<1'}
          sub="annual CO2 absorption"
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          icon={TrendingUp}
          label="Recycling Rate"
          value={`${impact.recyclingRate.toFixed(0)}%`}
          sub="of all waste"
          color="text-teal-600"
          bg="bg-teal-50"
        />
      </div>

      {!hasData ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Leaf className="w-7 h-7 text-slate-300" />
          </div>
          <h3 className="font-semibold text-slate-800">No impact data yet</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Once your completed pickups are weighed, your sustainability impact will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Breakdown by Waste Type */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-900 mb-1">Waste Breakdown</h3>
            <p className="text-xs text-slate-400 mb-4">Diversion by waste type across all completed pickups</p>
            {Object.keys(impact.byType).length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No waste recorded yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(impact.byType)
                  .sort(([, a], [, b]) => b.waste - a.waste)
                  .map(([type, data]) => {
                    const pct = impact.totalWaste > 0 ? (data.waste / impact.totalWaste) * 100 : 0;
                    const color = WASTE_COLORS[type] || '#94a3b8';
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-sm font-medium text-slate-700">{WASTE_LABELS[type] || type}</span>
                            <span className="text-xs text-slate-400">{data.count} pickup{data.count !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-slate-500">{Math.round(data.waste)} kg</span>
                            <span className="text-emerald-600 font-medium">{Math.round(data.diverted)} kg diverted</span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900">Achievements</h3>
              <span className="text-xs text-slate-400">{earnedBadges.length} of {BADGES.length} earned</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Milestones for your sustainability journey</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BADGES.map(badge => {
                const earned = earnedBadges.some(b => b.id === badge.id);
                const Icon = badge.icon;
                return (
                  <div
                    key={badge.id}
                    className={`relative p-4 rounded-xl border text-center transition-all ${
                      earned ? `${badge.bg} border-current/20` : 'bg-slate-50 border-slate-100 opacity-60'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full ${earned ? badge.bg : 'bg-slate-100'} flex items-center justify-center mx-auto mb-2`}>
                      <Icon className={`w-5 h-5 ${earned ? badge.color : 'text-slate-300'}`} />
                    </div>
                    <p className={`text-sm font-bold ${earned ? 'text-slate-800' : 'text-slate-400'}`}>{badge.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{badge.desc}</p>
                    {earned && (
                      <div className="absolute top-2 right-2">
                        <Award className={`w-3.5 h-3.5 ${badge.color}`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Equivalencies */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-sm">
            <h3 className="font-bold text-lg mb-1">Your Environmental Impact</h3>
            <p className="text-emerald-100 text-sm mb-5">What your {Math.round(impact.totalDiverted)} kg of diverted waste means in real terms</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <Trees className="w-6 h-6 text-emerald-100 mb-2" />
                <p className="text-2xl font-bold">{impact.treesEquivalent >= 1 ? Math.round(impact.treesEquivalent) : '<1'}</p>
                <p className="text-xs text-emerald-100">Trees' annual CO2 absorption</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <Trash2 className="w-6 h-6 text-emerald-100 mb-2" />
                <p className="text-2xl font-bold">{Math.round(impact.landfillSaved)}</p>
                <p className="text-xs text-emerald-100">kg kept out of landfill</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <Factory className="w-6 h-6 text-emerald-100 mb-2" />
                <p className="text-2xl font-bold">{(impact.totalCO2 / 1000).toFixed(2)}</p>
                <p className="text-xs text-emerald-100">tonnes CO2 avoided</p>
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 text-xs text-slate-400 px-1">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Diversion rates and CO2 factors are estimates based on waste type. When drivers record actual
              diverted weights, those values are used directly. Trees equivalent assumes ~21 kg CO2 absorbed per tree per year.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: typeof Leaf; label: string; value: string; sub: string; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-2`}>
        <Icon className={`w-4.5 h-4.5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}
