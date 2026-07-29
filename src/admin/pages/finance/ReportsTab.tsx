import { useEffect, useState, useCallback } from 'react';
import {
  FileBarChart, Loader2, X, Download, Send, Mail, Calendar,
  TrendingUp, TrendingDown, Wallet, FileText, Banknote, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface FinanceReport {
  id: string;
  user_id: string | null;
  report_type: string;
  period_start: string;
  period_end: string;
  summary: Record<string, any>;
  status: string;
  created_at: string;
}

function fmtMoney(n: number) {
  return `SLE ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const REPORT_TYPES = [
  { id: 'weekly_digest', label: 'Weekly Digest', desc: 'Revenue, invoices, and withdrawals summary', icon: FileBarChart },
  { id: 'admin_revenue', label: 'Revenue Report', desc: 'Full financial overview for a period', icon: TrendingUp },
  { id: 'client_statement', label: 'Client Statement', desc: 'Individual client financial statement', icon: FileText },
] as const;

export function ReportsTab() {
  const [reports, setReports] = useState<FinanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [viewReport, setViewReport] = useState<FinanceReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('finance_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setReports((data || []) as FinanceReport[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
        <FileBarChart className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Financial Reports & Statements</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Generate revenue digests, client statements, and financial summaries. Reports can be emailed
            directly to clients and are stored for future reference.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-sm">Generated Reports</h3>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm whitespace-nowrap">
            <FileBarChart className="w-4 h-4" /> Generate Report
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="text-center py-16">
            <FileBarChart className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No reports generated yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "Generate Report" to create a financial summary.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => {
            const typeMeta = REPORT_TYPES.find(t => t.id === r.report_type) || { icon: FileBarChart, label: r.report_type };
            const Icon = typeMeta.icon;
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{typeMeta.label}</p>
                    <p className="text-xs text-slate-400">{formatDate(r.period_start)} – {formatDate(r.period_end)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === 'emailed' && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-semibold">
                        <Mail className="w-3 h-3" /> Emailed
                      </span>
                    )}
                    <button onClick={() => setViewReport(r)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                      View
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          generating={generating}
          onGenerate={async (reportType, userId, periodStart, periodEnd, sendEmail) => {
            setGenerating(true);
            try {
              const { error } = await supabase.functions.invoke('generate-finance-report', {
                body: { action: 'generate', reportType, userId: userId || null, periodStart, periodEnd, sendEmail },
              });
              if (error) throw error;
              setShowGenerate(false);
              load();
            } catch (err: any) {
              alert(`Failed to generate: ${err.message}`);
            }
            setGenerating(false);
          }}
          onClose={() => setShowGenerate(false)}
        />
      )}

      {viewReport && (
        <ReportViewer report={viewReport} onClose={() => setViewReport(null)} />
      )}
    </>
  );
}

function GenerateModal({ generating, onGenerate, onClose }: {
  generating: boolean;
  onGenerate: (reportType: string, userId: string, periodStart: string, periodEnd: string, sendEmail: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [reportType, setReportType] = useState('weekly_digest');
  const [userId, setUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [periodStart, setPeriodStart] = useState(new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [sendEmail, setSendEmail] = useState(false);

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setUserResults(data || []);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reportType === 'client_statement' && !userId) { alert('Select a client'); return; }
    onGenerate(reportType, userId, periodStart, periodEnd, sendEmail);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Generate Report</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Report Type</label>
              <div className="space-y-2">
                {REPORT_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} type="button" onClick={() => setReportType(t.id)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all border-2 ${
                        reportType === t.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}>
                      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${reportType === t.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                        <p className="text-xs text-slate-400">{t.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {reportType === 'client_statement' && (
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Select Client</label>
                <input type="text" value={userSearch} onChange={e => searchUsers(e.target.value)} placeholder="Search by name or email…"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                {userResults.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {userResults.map(u => (
                      <button key={u.id} type="button"
                        onClick={() => { setUserId(u.id); setUserSearch(`${u.full_name || u.email}`); setUserResults([]); }}
                        className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${userId === u.id ? 'bg-emerald-50' : ''}`}>
                        <p className="text-sm font-medium text-slate-800">{u.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">From</label>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">To</label>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>

            {reportType === 'client_statement' && (
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Email to client</p>
                  <p className="text-xs text-slate-400">Send the statement directly to the client's email</p>
                </div>
              </label>
            )}

            <button type="submit" disabled={generating}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileBarChart className="w-5 h-5" />}
              {generating ? 'Generating…' : 'Generate Report'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReportViewer({ report, onClose }: { report: FinanceReport; onClose: () => void }) {
  const s = report.summary;
  const isClient = report.report_type === 'client_statement';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {isClient ? 'Client Statement' : report.report_type === 'weekly_digest' ? 'Weekly Digest' : 'Revenue Report'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div className="text-center mb-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider">Period</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">{formatDate(report.period_start)} – {formatDate(report.period_end)}</p>
            {isClient && s.client_name && (
              <p className="text-sm text-slate-500 mt-1">{s.client_name} · {s.client_email}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isClient ? (
              <>
                <StatBox label="Wallet Balance" value={fmtMoney(s.wallet_balance || 0)} icon={Wallet} color="text-emerald-600" />
                <StatBox label="Total Topped Up" value={fmtMoney(s.total_topped_up || 0)} icon={TrendingUp} color="text-blue-600" />
                <StatBox label="Total Spent" value={fmtMoney(s.total_spent || 0)} icon={TrendingDown} color="text-red-600" />
                <StatBox label="Transactions" value={String(s.transaction_count || 0)} icon={FileBarChart} color="text-slate-600" />
                <StatBox label="Invoices Paid" value={String(s.invoices_paid || 0)} icon={FileText} color="text-emerald-600" />
                <StatBox label="Outstanding" value={String(s.invoices_outstanding || 0)} icon={FileText} color="text-amber-600" />
              </>
            ) : (
              <>
                <StatBox label="Total Inflow" value={fmtMoney(s.total_inflow || 0)} icon={TrendingUp} color="text-emerald-600" />
                <StatBox label="Total Outflow" value={fmtMoney(s.total_outflow || 0)} icon={TrendingDown} color="text-red-600" />
                <StatBox label="Net Flow" value={fmtMoney(s.net_flow || 0)} icon={Wallet} color="text-slate-700" />
                <StatBox label="Invoiced" value={fmtMoney(s.total_invoiced || 0)} icon={FileText} color="text-blue-600" />
                <StatBox label="Collected" value={fmtMoney(s.total_collected || 0)} icon={TrendingUp} color="text-emerald-600" />
                <StatBox label="Outstanding" value={fmtMoney(s.outstanding_invoices || 0)} icon={FileText} color="text-amber-600" />
                <StatBox label="Pending Withdrawals" value={fmtMoney(s.pending_withdrawals || 0)} icon={Banknote} color="text-amber-600" />
                <StatBox label="Completed Withdrawals" value={fmtMoney(s.completed_withdrawals || 0)} icon={Banknote} color="text-emerald-600" />
              </>
            )}
          </div>

          {isClient && s.transactions && s.transactions.length > 0 && (
            <div className="mt-5">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transactions</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {s.transactions.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-slate-700 capitalize">{t.type} · {t.method || '-'}</p>
                      <p className="text-[10px] text-slate-400">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={`text-xs font-bold ${Number(t.amount_sle) > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {Number(t.amount_sle) > 0 ? '+' : ''}{fmtMoney(Number(t.amount_sle))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: typeof Wallet; color: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      </div>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}
