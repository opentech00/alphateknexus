import { useEffect, useState } from 'react';
import {
  TrendingUp, Users, Clock, AlertTriangle, UserCheck, MessageSquare,
  CalendarCheck, BookOpen, Sparkles, RefreshCw, FileText, Wallet, Star, Smartphone,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card } from '../components/ui';

interface Stats {
  activeJobs: number;
  totalClients: number;
  pendingTasks: number;
  incidents: number;
  activeClients: number;
  openRequests: number;
  scheduledPickups: number;
  activeBookings: number;
  quoteRequests: number;
}

const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
const revenueData = [12, 18, 24, 15, 32, 28];
const expenseData = [8, 12, 16, 10, 20, 18];
const completionData = [1, 0, 1, 2, 12, 3];

const divisionMeta = [
  { name: 'Clearing & Forwarding', slug: 'clearing-forwarding', color: 'bg-blue-500' },
  { name: 'Smart Sort', slug: 'smart-sort', color: 'bg-emerald-500' },
  { name: 'Cleaning Services', slug: 'cleaning-services', color: 'bg-cyan-500' },
  { name: 'Private Security', slug: 'private-security', color: 'bg-amber-500' },
  { name: 'Procurement', slug: 'procurement', color: 'bg-rose-500' },
];

const growthData = [5, 8, 12, 10, 15, 22];

export function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState('');
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [stats, setStats] = useState<Stats>({
    activeJobs: 0, totalClients: 0, pendingTasks: 0, incidents: 0,
    activeClients: 0, openRequests: 0, scheduledPickups: 0, activeBookings: 0,
    quoteRequests: 0,
  });
  const [divisionJobs, setDivisionJobs] = useState<Record<string, number>>(
    Object.fromEntries(divisionMeta.map((d) => [d.slug, 0]))
  );
  const [walletStats, setWalletStats] = useState({ totalBalance: 0, totalTopUps: 0, activeWallets: 0 });
  const [reviewStats, setReviewStats] = useState({ total: 0, avg: 0, appReviews: 0 });

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('*, services(name, slug)')
        .order('created_at', { ascending: false });
      const allBookings = data || [];

      const active = allBookings.filter((b: any) => ['confirmed', 'in_progress'].includes(b.status)).length;
      const pending = allBookings.filter((b: any) => ['pending', 'pending_review'].includes(b.status)).length;
      const uniqueClients = new Set(allBookings.map((b: any) => b.contact_phone)).size;
      const scheduled = allBookings.filter((b: any) => b.status === 'confirmed' && new Date(b.scheduled_date) > new Date()).length;
      const quotes = allBookings.filter((b: any) => b.details?.quote_request === true).length;

      setStats({
        activeJobs: active + pending,
        totalClients: uniqueClients,
        pendingTasks: pending,
        incidents: allBookings.filter((b: any) => b.status === 'cancelled').length,
        activeClients: uniqueClients,
        openRequests: pending,
        scheduledPickups: scheduled,
        activeBookings: allBookings.filter((b: any) => !['completed', 'cancelled'].includes(b.status)).length,
        quoteRequests: quotes,
      });

      const jobsBySlug: Record<string, number> = {};
      allBookings.forEach((b: any) => {
        const slug = b.services?.slug;
        if (slug && !['completed', 'cancelled'].includes(b.status)) {
          jobsBySlug[slug] = (jobsBySlug[slug] || 0) + 1;
        }
      });
      setDivisionJobs(jobsBySlug);

      const { data: walletData } = await supabase
        .from('wallet_transactions')
        .select('amount_sle, type, status, user_id')
        .eq('status', 'completed');
      const wData = walletData || [];
      const wBalance = wData.reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
      const wTopUps = wData.filter((t: any) => t.type === 'topup').reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
      const wWallets = new Set(wData.map((t: any) => t.user_id)).size;
      setWalletStats({ totalBalance: wBalance, totalTopUps: wTopUps, activeWallets: wWallets });

      const { data: reviewData } = await supabase
        .from('reviews')
        .select('rating, service_id, booking_id');
      const rData = reviewData || [];
      const appR = rData.filter((r: any) => !r.service_id && !r.booking_id);
      setReviewStats({
        total: rData.length,
        avg: rData.length ? rData.reduce((s: number, r: any) => s + r.rating, 0) / rData.length : 0,
        appReviews: appR.length,
      });

      setLoading(false);
    };
    fetch();
  }, []);

  const generateInsight = () => {
    setGeneratingInsight(true);
    setTimeout(() => {
      const insights = [
        `Based on current data: ${stats.activeJobs} active jobs across divisions. Pending tasks are ${stats.pendingTasks > 5 ? 'above average' : 'within normal range'}. Consider allocating more resources to high-demand services.`,
        `Client engagement is ${stats.activeClients > 3 ? 'strong' : 'growing'}. ${stats.openRequests} open requests suggest healthy demand. Recommend optimizing scheduling to reduce turnaround time.`,
        `Operational efficiency: ${stats.activeBookings} active bookings with ${stats.scheduledPickups} scheduled. Focus on reducing pending-to-confirmed conversion time for better client satisfaction.`,
      ];
      setAiInsight(insights[Math.floor(Math.random() * insights.length)]);
      setGeneratingInsight(false);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        description="Real-time overview across all divisions"
        icon={TrendingUp}
      />

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Active Jobs" value={stats.activeJobs} icon={TrendingUp} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Total Clients" value={stats.totalClients} icon={Users} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Pending Tasks" value={stats.pendingTasks} icon={Clock} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Incidents" value={stats.incidents} icon={AlertTriangle} color="text-red-500" accent="bg-red-50" />
      </div>

      {/* Client Portal Overview */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Client Portal Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PortalStat icon={UserCheck} value={stats.activeClients} label="Active Clients" color="text-blue-600" bg="bg-blue-50" />
          <PortalStat icon={MessageSquare} value={stats.openRequests} label="Open Requests" color="text-slate-600" bg="bg-slate-100" />
          <PortalStat icon={FileText} value={stats.quoteRequests} label="Quote Requests" color="text-indigo-600" bg="bg-indigo-50" />
          <PortalStat icon={CalendarCheck} value={stats.scheduledPickups} label="Scheduled Pickups" color="text-emerald-600" bg="bg-emerald-50" />
          <PortalStat icon={BookOpen} value={stats.activeBookings} label="Active Bookings" color="text-teal-600" bg="bg-teal-50" />
          <PortalStat icon={Wallet} value={`SLE ${walletStats.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} label="Wallet Balance" color="text-emerald-600" bg="bg-emerald-50" />
          <PortalStat icon={TrendingUp} value={`SLE ${walletStats.totalTopUps.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} label="Wallet Top-Ups" color="text-blue-600" bg="bg-blue-50" />
          <PortalStat icon={Users} value={walletStats.activeWallets} label="Active Wallets" color="text-amber-600" bg="bg-amber-50" />
          <PortalStat icon={Star} value={reviewStats.avg.toFixed(1)} label="Avg Rating" color="text-amber-600" bg="bg-amber-50" />
          <PortalStat icon={MessageSquare} value={reviewStats.total} label="Total Reviews" color="text-emerald-600" bg="bg-emerald-50" />
          <PortalStat icon={Smartphone} value={reviewStats.appReviews} label="App Reviews" color="text-blue-600" bg="bg-blue-50" />
        </div>
      </Card>

      {/* AI Insights */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-600" />
            </div>
            <h2 className="text-base font-bold text-slate-900">AI Insights</h2>
          </div>
          <button
            onClick={generateInsight}
            disabled={generatingInsight}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generatingInsight ? 'animate-spin' : ''}`} />
            Generate
          </button>
        </div>
        {aiInsight ? (
          <p className="text-sm text-slate-600 leading-relaxed">{aiInsight}</p>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">
            Click "Generate" to get AI-powered insights about your business
          </p>
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Revenue vs Expenses */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900 mb-5">Revenue vs Expenses (6mo)</h2>
          <div className="h-48 sm:h-52 flex items-end justify-between gap-2 sm:gap-3 px-1">
            {months.map((month, i) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-1 h-36 sm:h-40">
                  <div className="w-2.5 sm:w-3 bg-emerald-500 rounded-t-sm transition-all duration-700 hover:bg-emerald-600" style={{ height: `${(revenueData[i] / 35) * 100}%` }} />
                  <div className="w-2.5 sm:w-3 bg-slate-300 rounded-t-sm transition-all duration-700 hover:bg-slate-400" style={{ height: `${(expenseData[i] / 35) * 100}%` }} />
                </div>
                <span className="text-[11px] text-slate-400 mt-1">{month}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Revenue
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-300" /> Expenses
            </span>
          </div>
        </Card>

        {/* Job Completion Rates */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900 mb-5">Job Completion Rates</h2>
          <div className="h-48 sm:h-52 flex items-end justify-between gap-2 sm:gap-3 px-1">
            {months.map((month, i) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center h-36 sm:h-40">
                  <div
                    className={`w-4 sm:w-5 rounded-t-sm transition-all duration-700 ${completionData[i] > 5 ? 'bg-amber-500' : 'bg-teal-500'}`}
                    style={{ height: `${(completionData[i] / 14) * 100}%`, minHeight: completionData[i] > 0 ? '4px' : '0' }}
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1">{month}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bottom Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Division Performance */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Division Performance (Active Jobs)</h2>
          <div className="space-y-3">
            {divisionMeta.map((div) => {
              const jobs = divisionJobs[div.slug] || 0;
              const maxJobs = Math.max(...Object.values(divisionJobs), 1);
              return (
                <div key={div.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-600">{div.name}</span>
                    <span className="text-sm font-semibold text-slate-900">{jobs}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${div.color} transition-all duration-700`}
                      style={{ width: `${(jobs / maxJobs) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Monthly Growth Trend */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900 mb-5">Monthly Growth Trend</h2>
          <div className="h-44 sm:h-48 flex items-end justify-between gap-2 sm:gap-3 px-1 relative">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border-b border-dashed border-slate-100" />
              ))}
            </div>
            {months.map((month, i) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-1 relative z-10">
                <div className="w-full flex items-end justify-center h-36 sm:h-40">
                  <div
                    className="w-4 sm:w-5 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm transition-all duration-700"
                    style={{ height: `${(growthData[i] / 25) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1">{month}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PortalStat({ icon: Icon, value, label, color, bg }: {
  icon: typeof UserCheck; value: string | number; label: string; color: string; bg: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-slate-900 leading-tight truncate">{value}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}
