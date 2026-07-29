import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Zap, Headphones, Tag, Clock, ShieldCheck, Star,
  ChevronRight, ArrowRight, Gift, MessageCircle, Phone, CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Props {
  onBack: () => void;
}

interface Stats {
  total: number;
  completed: number;
  memberSince: string;
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex-1 flex items-center gap-2 px-3 py-2.5">
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-emerald-100/80 leading-none">{label}</p>
        <p className="text-sm font-bold text-white truncate leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

const BENEFITS = [
  {
    icon: Zap,
    color: 'text-yellow-500',
    bg: 'bg-yellow-50',
    title: 'Priority Bookings',
    desc: 'Get priority for your bookings and preferred time slots.',
  },
  {
    icon: Headphones,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    title: 'Dedicated Support',
    desc: 'Access to dedicated support team for faster resolutions.',
  },
  {
    icon: Tag,
    color: 'text-pink-500',
    bg: 'bg-pink-50',
    title: 'Exclusive Discounts',
    desc: 'Enjoy special discounts and offers reserved for premium clients.',
  },
  {
    icon: Clock,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    title: 'Faster Service',
    desc: 'Your requests are prioritized for quicker turnaround.',
  },
  {
    icon: ShieldCheck,
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    title: 'Extended Warranty',
    desc: 'Extended warranty on eligible services and products.',
  },
  {
    icon: Star,
    color: 'text-violet-500',
    bg: 'bg-violet-50',
    title: 'Premium Partner Network',
    desc: 'Access to our premium partners and trusted vendors.',
  },
];

export function PremiumBenefitsPage({ onBack }: Props) {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, memberSince: 'Jan 2026' });
  const [offerCopied, setOfferCopied] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('bookings')
      .select('status')
      .eq('user_id', user.id);
    const bookings = data || [];
    const memberSince = user.created_at
      ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : 'Jan 2026';
    setStats({
      total: bookings.length,
      completed: bookings.filter((b: any) => b.status === 'completed').length,
      memberSince,
    });
  }, [user]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleClaimOffer = () => {
    try { navigator.clipboard.writeText('PREMIUM10'); } catch {}
    setOfferCopied(true);
    setTimeout(() => setOfferCopied(false), 2500);
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 shadow-sm">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
        <h1 className="font-bold text-slate-800 dark:text-white text-base">Premium Benefits</h1>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Hero card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-green-500 p-5 shadow-lg shadow-emerald-900/20">
          {/* Decorative silhouette */}
          <div className="absolute right-4 bottom-0 opacity-10 pointer-events-none select-none translate-y-2">
            <svg width="90" height="90" viewBox="0 0 90 90" fill="white">
              <ellipse cx="45" cy="70" rx="30" ry="8" />
              <circle cx="45" cy="30" r="22" />
              <rect x="30" y="50" width="30" height="20" rx="4" />
            </svg>
          </div>

          <p className="text-emerald-100 text-xs font-semibold mb-2 tracking-wide">Welcome Premium Client</p>
          <div className="flex items-start gap-4">
            {/* Diamond icon */}
            <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center flex-shrink-0 shadow-inner">
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                <path d="M17 4L6 14l11 16 11-16L17 4z" fill="#FFD700" opacity="0.9"/>
                <path d="M6 14h22" stroke="#FFD700" strokeWidth="1.5" opacity="0.6"/>
                <circle cx="17" cy="6" r="2.5" fill="#FFD700" opacity="0.7"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-extrabold text-xl leading-tight">
                Thank you for being<br />with us! 💛
              </h2>
              <p className="text-emerald-100 text-xs mt-1.5 leading-relaxed">
                Enjoy priority support, exclusive offers and faster service.
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-4 flex divide-x divide-white/20 bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden">
            <StatCell icon={<CalendarDays className="w-4 h-4 text-emerald-200" />} label="Total Bookings" value={String(stats.total)} />
            <StatCell icon={<CheckCircle2 className="w-4 h-4 text-emerald-200" />} label="Completed" value={String(stats.completed)} />
            <StatCell icon={<CalendarDays className="w-4 h-4 text-emerald-200" />} label="Member Since" value={stats.memberSince} />
          </div>
        </div>

        {/* Section heading */}
        <div className="flex items-center justify-center gap-2 py-1">
          <ArrowRight className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-slate-800 dark:text-white text-sm">Your Premium Benefits</span>
          <ArrowLeft className="w-4 h-4 text-emerald-600" />
        </div>

        {/* Benefits list */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm divide-y divide-slate-50 dark:divide-slate-700/60">
          {BENEFITS.map(({ icon: Icon, color, bg, title, desc }) => (
            <div key={title} className="flex items-center gap-4 px-5 py-4">
              <div className={`w-10 h-10 ${bg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{desc}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/40 dark:text-emerald-400 px-2.5 py-1 rounded-full">
                  Included
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
              </div>
            </div>
          ))}
        </div>

        {/* Exclusive offer card */}
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-3xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-11 h-11 bg-emerald-100 dark:bg-emerald-800 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Gift className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Exclusive Offer for You!</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
              Get <span className="font-bold">10%</span> off on your next booking.
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Use code: <span className="font-extrabold text-slate-800 dark:text-white">PREMIUM10</span>
            </p>
          </div>
          <button
            onClick={handleClaimOffer}
            className="flex-shrink-0 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-bold rounded-2xl transition-all shadow-sm whitespace-nowrap"
          >
            {offerCopied ? 'Copied!' : 'Claim Offer'}
          </button>
        </div>

        {/* Need Help */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <div className="mb-3">
            <p className="font-bold text-slate-800 dark:text-white text-sm">Need Help?</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Our premium support team is here for you.</p>
          </div>
          <div className="flex gap-3">
            <a
              href="mailto:support@alphateknexus.com"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-emerald-600 text-emerald-700 dark:text-emerald-400 dark:border-emerald-600 text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/30 active:scale-95 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              Chat Now
            </a>
            <a
              href="tel:+23276000000"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold active:scale-95 transition-all shadow-sm"
            >
              <Phone className="w-4 h-4" />
              Call Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
