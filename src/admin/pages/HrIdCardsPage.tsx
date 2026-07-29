import { useEffect, useMemo, useState } from 'react';
import {
  CreditCard as IdCardIcon, Search, RefreshCw, X, Printer, RotateCw, AlertCircle, Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { type IdCard, type Employee, STATUS_META, fmtDate } from '../hr/types';

export function HrIdCardsPage() {
  const [cards, setCards] = useState<IdCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [preview, setPreview] = useState<IdCard | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('id_cards')
      .select('*, employees(id,full_name,employee_number,photo_url,email,phone,hr_roles(name),services(name))')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setCards(data as IdCard[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: cards.length,
    active: cards.filter(c => c.status === 'active').length,
    expired: cards.filter(c => c.status === 'expired').length,
    revoked: cards.filter(c => c.status === 'revoked').length,
  }), [cards]);

  const filtered = useMemo(() => {
    let r = cards;
    if (statusFilter !== 'all') r = r.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(c =>
        c.card_number.toLowerCase().includes(s) ||
        (c.employees?.full_name || '').toLowerCase().includes(s) ||
        (c.employees?.employee_number || '').toLowerCase().includes(s),
      );
    }
    return r;
  }, [cards, statusFilter, search]);

  const regenerate = async (card: IdCard) => {
    if (!confirm('Regenerate this ID card? A new card number will be issued.')) return;
    const year = new Date().getFullYear();
    const card_number = `ATN-${year}-${Date.now().toString().slice(-4)}`;
    const qr_payload = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/employee-public-profile?id=${card.employee_id}`;
    const { error: err } = await supabase.from('id_cards').update({
      card_number, qr_payload, issue_date: new Date().toISOString().split('T')[0], status: 'active',
    }).eq('id', card.id);
    if (err) { alert(err.message); return; }
    load();
  };

  const revoke = async (card: IdCard) => {
    if (!confirm('Revoke this ID card?')) return;
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'revoked' } : c));
    await supabase.from('id_cards').update({ status: 'revoked' }).eq('id', card.id);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff ID Cards"
        description="Auto-generated ID cards with QR codes"
        icon={IdCardIcon}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Cards" value={stats.total} icon={IdCardIcon} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={IdCardIcon} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Expired" value={stats.expired} icon={AlertCircle} color="text-red-600" accent="bg-red-50" />
        <StatCard label="Revoked" value={stats.revoked} icon={AlertCircle} color="text-slate-600" accent="bg-slate-100" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search card no, name, employee no…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
          <button onClick={load} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={IdCardIcon} title="No ID cards yet" description="ID cards are auto-generated when employees are added." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const sm = STATUS_META[c.status] ?? STATUS_META.active;
            const emp = c.employees;
            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                      <IdCardIcon className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">{emp?.full_name || 'Unknown'}</h3>
                      <p className="text-xs text-slate-400">{c.card_number}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${sm.cls}`}>{sm.label}</span>
                </div>
                <div className="space-y-1 text-xs text-slate-500 mb-3">
                  <p>Employee: {emp?.employee_number || '—'}</p>
                  <p>Issued: {fmtDate(c.issue_date)}</p>
                  <p>Expires: {fmtDate(c.expiry_date)}</p>
                </div>
                <div className="flex gap-1.5 border-t border-slate-100 pt-2.5">
                  <button onClick={() => setPreview(c)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <Printer className="w-3.5 h-3.5" /> View / Print
                  </button>
                  <button onClick={() => regenerate(c)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Regenerate">
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  {c.status === 'active' && (
                    <button onClick={() => revoke(c)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Revoke">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && <CardPreviewModal card={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ── Card Preview / Print ───────────────────────────────────────────────────

function CardPreviewModal({ card, onClose }: { card: IdCard; onClose: () => void }) {
  const emp = card.employees;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(card.qr_payload)}`;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>ID Card - ${emp?.full_name || ''}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; padding: 20px; background: #f1f5f9; }
        .card { width: 340px; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
        .card-header { background: #1e293b; color: white; padding: 16px; display: flex; align-items: center; gap: 10px; }
        .card-header .logo { width: 36px; height: 36px; background: #10b981; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; }
        .card-header h2 { font-size: 14px; font-weight: 700; }
        .card-header p { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; }
        .card-body { background: white; padding: 20px; display: flex; gap: 16px; }
        .photo { width: 80px; height: 80px; border-radius: 12px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; color: #64748b; flex-shrink: 0; overflow: hidden; }
        .photo img { width: 100%; height: 100%; object-fit: cover; }
        .info { flex: 1; }
        .info h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
        .info .role { font-size: 12px; color: #10b981; font-weight: 600; margin-bottom: 8px; }
        .info .row { font-size: 11px; color: #64748b; margin-bottom: 2px; }
        .card-footer { background: #f8fafc; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; }
        .card-footer .card-no { font-size: 10px; color: #94a3b8; }
        .card-footer .qr { width: 50px; height: 50px; }
        @media print { body { background: white; padding: 0; } .card { box-shadow: none; } }
      </style></head><body>
      <div class="card">
        <div class="card-header">
          <div class="logo">A</div>
          <div><h2>Alphatek Nexus</h2><p>Staff Identification</p></div>
        </div>
        <div class="card-body">
          <div class="photo">${emp?.photo_url ? `<img src="${emp.photo_url}" alt="${emp?.full_name || ''}" />` : (emp?.full_name?.[0]?.toUpperCase() || '?')}</div>
          <div class="info">
            <h3>${emp?.full_name || 'Unknown'}</h3>
            <div class="role">${(emp as any)?.hr_roles?.name || 'Staff'}</div>
            <div class="row">ID: ${emp?.employee_number || '—'}</div>
            <div class="row">${emp?.email || ''}</div>
            <div class="row">${emp?.phone || ''}</div>
            <div class="row">${(emp as any)?.services?.name || ''}</div>
          </div>
        </div>
        <div class="card-footer">
          <div class="card-no">Card: ${card.card_number}<br>Issued: ${fmtDate(card.issue_date)}</div>
          <img class="qr" src="${qrUrl}" alt="QR" />
        </div>
      </div>
      <script>window.onload = () => { window.print(); };</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-bold text-slate-900">ID Card Preview</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 flex flex-col items-center">
          {/* Card mockup */}
          <div className="w-full max-w-[320px] rounded-2xl overflow-hidden shadow-lg">
            <div className="bg-[#1e293b] text-white p-4 flex items-center gap-2.5">
              <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-lg">A</div>
              <div>
                <h2 className="text-sm font-bold">Alphatek Nexus</h2>
                <p className="text-[9px] uppercase tracking-widest opacity-70">Staff Identification</p>
              </div>
            </div>
            <div className="bg-white p-5 flex gap-4">
              <div className="w-20 h-20 bg-slate-100 rounded-xl flex items-center justify-center text-3xl font-bold text-slate-400 flex-shrink-0 overflow-hidden">
                {emp?.photo_url
                  ? <img src={emp.photo_url} alt={emp?.full_name} className="w-full h-full object-cover" />
                  : (emp?.full_name?.[0]?.toUpperCase() || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">{emp?.full_name || 'Unknown'}</h3>
                <p className="text-xs text-emerald-600 font-medium mb-2">{(emp as any)?.hr_roles?.name || 'Staff'}</p>
                <p className="text-xs text-slate-500">ID: {emp?.employee_number}</p>
                <p className="text-xs text-slate-500 truncate">{emp?.email}</p>
                <p className="text-xs text-slate-500">{emp?.phone}</p>
                <p className="text-xs text-slate-500">{(emp as any)?.services?.name}</p>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3 flex justify-between items-center border-t border-slate-200">
              <div className="text-[10px] text-slate-400">
                Card: {card.card_number}<br />
                Issued: {fmtDate(card.issue_date)}
              </div>
              <img src={qrUrl} alt="QR Code" className="w-12 h-12" />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">Close</button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors">
            <Printer className="w-4 h-4" /> Print Card
          </button>
        </div>
      </div>
    </div>
  );
}
