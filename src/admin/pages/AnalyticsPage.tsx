import { useEffect, useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Calendar,
  Loader2,
  PieChart,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card, Spinner } from '../components/ui';

interface Booking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  created_at: string;
  updated_at: string | null;
  details: Record<string, any> | null;
  services: { name: string; slug: string };
}

type DateRange = '7' | '30' | '90' | 'all';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  in_progress: '#10b981',
  completed: '#0d9488',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function AnalyticsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30');

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name, slug)')
      .order('created_at', { ascending: false });

    setBookings((data as unknown as Booking[]) || []);
    setLoading(false);
  };

  const filteredBookings = useMemo(() => {
    if (dateRange === 'all') return bookings;

    const now = new Date();
    const daysAgo = new Date();
    daysAgo.setDate(now.getDate() - parseInt(dateRange));

    return bookings.filter((b) => new Date(b.created_at) >= daysAgo);
  }, [bookings, dateRange]);

  const summaryStats = useMemo(() => {
    const total = filteredBookings.length;
    const completed = filteredBookings.filter((b) => b.status === 'completed').length;
    const conversionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

    // Avg response time: time from created_at to when status changed (updated_at)
    const withResponse = filteredBookings.filter((b) => b.updated_at && b.status !== 'pending');
    let avgResponseHours = 0;
    if (withResponse.length > 0) {
      const totalHours = withResponse.reduce((sum, b) => {
        const created = new Date(b.created_at).getTime();
        const updated = new Date(b.updated_at!).getTime();
        return sum + (updated - created) / (1000 * 60 * 60);
      }, 0);
      avgResponseHours = totalHours / withResponse.length;
    }

    return { total, completed, conversionRate, avgResponseHours };
  }, [filteredBookings]);

  const serviceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredBookings.forEach((b) => {
      const name = b.services?.name || 'Unknown';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [filteredBookings]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    filteredBookings.forEach((b) => {
      if (counts[b.status] !== undefined) {
        counts[b.status]++;
      }
    });
    return counts;
  }, [filteredBookings]);

  const monthlyTrend = useMemo(() => {
    const months: { label: string; count: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const count = bookings.filter((b) => {
        const created = new Date(b.created_at);
        return created >= monthStart && created <= monthEnd;
      }).length;

      months.push({ label, count });
    }

    return months;
  }, [bookings]);

  const topClients = useMemo(() => {
    const clientMap: Record<string, { name: string; phone: string; count: number; lastDate: string }> = {};

    filteredBookings.forEach((b) => {
      const key = b.contact_phone || b.contact_name;
      if (!clientMap[key]) {
        clientMap[key] = {
          name: b.contact_name,
          phone: b.contact_phone,
          count: 0,
          lastDate: b.created_at,
        };
      }
      clientMap[key].count++;
      if (new Date(b.created_at) > new Date(clientMap[key].lastDate)) {
        clientMap[key].lastDate = b.created_at;
      }
    });

    return Object.values(clientMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredBookings]);

  const quoteVsHire = useMemo(() => {
    let quotes = 0;
    let hires = 0;
    filteredBookings.forEach((b) => {
      if (b.details?.quote_request === true) quotes++;
      else hires++;
    });
    return { quotes, hires };
  }, [filteredBookings]);

  const exportCSV = () => {
    const headers = ['ID', 'Type', 'Service', 'Client Name', 'Company', 'Phone', 'Email', 'Date', 'Status', 'Cargo/Goods', 'Origin', 'Destination', 'Payment'];
    const rows = filteredBookings.map((b) => [
      b.id,
      b.details?.quote_request === true ? 'Quote' : 'Hire',
      b.services?.name || 'Unknown',
      b.contact_name,
      b.details?.company_name || b.details?.company || '',
      b.contact_phone,
      b.contact_email || '',
      b.scheduled_date || b.created_at.split('T')[0],
      b.status,
      b.details?.cargo_description || b.details?.goods_nature || '',
      b.details?.origin || '',
      b.details?.destination || b.details?.address || '',
      b.details?.payment_method || '',
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookings-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Build conic-gradient for donut chart
  const donutGradient = useMemo(() => {
    const total = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);
    if (total === 0) return 'conic-gradient(#e2e8f0 0deg 360deg)';

    let currentDeg = 0;
    const segments: string[] = [];

    Object.entries(statusBreakdown).forEach(([status, count]) => {
      if (count === 0) return;
      const deg = (count / total) * 360;
      segments.push(`${STATUS_COLORS[status]} ${currentDeg}deg ${currentDeg + deg}deg`);
      currentDeg += deg;
    });

    return `conic-gradient(${segments.join(', ')})`;
  }, [statusBreakdown]);

  if (loading) {
    return <Spinner />;
  }

  const maxServiceCount = serviceBreakdown.length > 0 ? serviceBreakdown[0][1] : 1;
  const maxMonthCount = Math.max(...monthlyTrend.map((m) => m.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reporting"
        description="Insights and performance metrics for your bookings"
        icon={BarChart3}
        actions={
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {([
              ['7', '7 Days'],
              ['30', '30 Days'],
              ['90', '90 Days'],
              ['all', 'All Time'],
            ] as [DateRange, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setDateRange(value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  dateRange === value
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Bookings" value={summaryStats.total} icon={Calendar} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Completed" value={summaryStats.completed} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Conversion Rate" value={`${summaryStats.conversionRate}%`} icon={TrendingUp} color="text-teal-600" accent="bg-teal-50" />
        <StatCard label="Avg Response" value={summaryStats.avgResponseHours < 1 ? `${Math.round(summaryStats.avgResponseHours * 60)}m` : `${summaryStats.avgResponseHours.toFixed(1)}h`} icon={Clock} color="text-blue-600" accent="bg-blue-50" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Bookings by Service */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            Bookings by Service
          </h2>
          {serviceBreakdown.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No data available</p>
          ) : (
            <div className="space-y-3">
              {serviceBreakdown.map(([name, count]) => (
                <div key={name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700 font-medium truncate mr-2">{name}</span>
                    <span className="text-slate-500 font-mono">{count}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxServiceCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Status Breakdown - Donut Chart */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-teal-600" />
            Status Breakdown
          </h2>
          <div className="flex items-center justify-center gap-8">
            {/* Donut */}
            <div className="relative">
              <div
                className="w-40 h-40 rounded-full"
                style={{ background: donutGradient }}
              />
              <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">{filteredBookings.length}</p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2">
              {Object.entries(statusBreakdown).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                  <span className="text-slate-600">{STATUS_LABELS[status]}</span>
                  <span className="text-slate-400 font-mono ml-auto">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Quote vs Hire Breakdown */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Quote vs Hire Requests
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-600">Hire Bookings</span>
                <span className="text-sm font-semibold text-slate-900">{quoteVsHire.hires}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-700 transition-all duration-700"
                  style={{ width: `${(quoteVsHire.hires / Math.max(quoteVsHire.hires + quoteVsHire.quotes, 1)) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-600">Quote Requests</span>
                <span className="text-sm font-semibold text-slate-900">{quoteVsHire.quotes}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                  style={{ width: `${(quoteVsHire.quotes / Math.max(quoteVsHire.hires + quoteVsHire.quotes, 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Monthly Trend */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Monthly Trend (Last 6 Months)
          </h2>
          <div className="flex items-end justify-between gap-2 h-48 px-2">
            {monthlyTrend.map((month) => (
              <div key={month.label} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-600">{month.count}</span>
                <div className="w-full flex justify-center">
                  <div
                    className="w-full max-w-[48px] bg-gradient-to-t from-emerald-600 to-teal-400 rounded-t-md transition-all duration-500"
                    style={{
                      height: `${maxMonthCount > 0 ? (month.count / maxMonthCount) * 140 : 0}px`,
                      minHeight: month.count > 0 ? '8px' : '2px',
                    }}
                  />
                </div>
                <span className="text-xs text-slate-500">{month.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Top Clients */}
        <Card className="lg:col-span-2 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            Top Clients
          </h2>
          {topClients.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No client data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">#</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Name</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Phone</th>
                    <th className="text-center py-2 px-3 text-slate-500 font-medium">Bookings</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Last Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((client, i) => (
                    <tr
                      key={client.phone + client.name}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">{client.name}</td>
                      <td className="py-2.5 px-3 text-slate-500">{client.phone}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-xs">
                          {client.count}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {new Date(client.lastDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Export Section */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-slate-600" />
            Export Data
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            Download your booking data as a CSV file for use in spreadsheets or other tools.
          </p>
          <div className="space-y-3">
            <button
              onClick={exportCSV}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-medium text-sm hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export as CSV
            </button>
            <p className="text-xs text-slate-400 text-center">
              {filteredBookings.length} records ({dateRange === 'all' ? 'all time' : `last ${dateRange} days`})
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
