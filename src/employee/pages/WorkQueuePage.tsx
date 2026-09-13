import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ClipboardList, Inbox, Loader2,
  MessageSquare, UserPlus, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { fmtDate } from '../types';
import { EmployeeBookingChat } from '../components/EmployeeBookingChat';

type Tab = 'quotes' | 'unassigned' | 'cash' | 'tasks';

interface QueueBooking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  user_id: string;
  assigned_to: string | null;
  review_note: string | null;
  services?: { name: string } | { name: string }[] | null;
}

interface TeamMember {
  id: string;
  user_id: string | null;
  full_name: string;
}

interface CashRow {
  id: string;
  reference: string;
  amount_sle: number;
  payable_type: string;
  created_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
}

function serviceName(b: QueueBooking) {
  if (!b.services) return 'Service';
  return Array.isArray(b.services) ? (b.services[0]?.name || 'Service') : b.services.name;
}

export function WorkQueuePage({ onOpenCash }: { onOpenCash: () => void }) {
  const { employee, user, hasCapability } = useAuth();
  const canApprove = hasCapability('div.approve_quotes');
  const canManage = hasCapability('div.manage_bookings');
  const canCash = hasCapability('div.cash_collections');
  const canMessage = hasCapability('div.message_clients') || hasCapability('div.view');

  const [tab, setTab] = useState<Tab>('quotes');
  const [quotes, setQuotes] = useState<QueueBooking[]>([]);
  const [unassigned, setUnassigned] = useState<QueueBooking[]>([]);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chatBooking, setChatBooking] = useState<QueueBooking | null>(null);

  const load = useCallback(async () => {
    if (!employee?.service_id) { setLoading(false); return; }
    setLoading(true);
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const [quoteRes, openRes, teamRes, cashRes, taskRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, user_id, assigned_to, review_note, services(name)')
        .eq('service_id', employee.service_id)
        .in('status', ['pending_review', 'pending'])
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, user_id, assigned_to, review_note, services(name)')
        .eq('service_id', employee.service_id)
        .is('assigned_to', null)
        .gte('scheduled_date', today)
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'completed')
        .order('scheduled_date', { ascending: true })
        .limit(40),
      supabase
        .from('employees')
        .select('id, user_id, full_name')
        .eq('service_id', employee.service_id)
        .eq('status', 'active')
        .order('full_name'),
      canCash
        ? supabase.from('payments').select('id, reference, amount_sle, payable_type, created_at').eq('method', 'cash').eq('status', 'pending').order('created_at', { ascending: false }).limit(20)
        : Promise.resolve({ data: [] }),
      user
        ? supabase.from('task_delegations').select('id, title, status, due_date, priority').eq('assigned_to', user.id).in('status', ['pending', 'accepted', 'in_progress']).lt('due_date', today).order('due_date', { ascending: true }).limit(20)
        : Promise.resolve({ data: [] }),
    ]);
    setQuotes((quoteRes.data as QueueBooking[]) || []);
    setUnassigned((openRes.data as QueueBooking[]) || []);
    setTeam((teamRes.data as TeamMember[]) || []);
    setCash((cashRes.data as CashRow[]) || []);
    setTasks((taskRes.data as TaskRow[]) || []);
    setLoading(false);
  }, [employee?.service_id, user, canCash]);

  useEffect(() => { void load(); }, [load]);

  const review = async (booking: QueueBooking, next: 'approved' | 'cancelled') => {
    if (!canApprove && next === 'approved') return;
    if (!note.trim() && next === 'cancelled') {
      setError('Add a note when rejecting a quote.');
      return;
    }
    setBusyId(booking.id);
    setError('');
    const { error: err } = await supabase.from('bookings').update({
      status: next,
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
      review_note: note.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', booking.id);
    if (err) {
      setError(err.message);
    } else {
      await supabase.rpc('notify_booking_party', {
        p_booking_id: booking.id,
        p_title: next === 'approved' ? 'Booking approved' : 'Booking not approved',
        p_body: next === 'approved'
          ? 'Your request was approved. You can continue in the client portal.'
          : (note.trim() || 'Please contact us for more information.'),
        p_type: 'booking_update',
      });
      setNote('');
      await load();
    }
    setBusyId(null);
  };

  const assign = async (bookingId: string, userId: string) => {
    if (!canManage) return;
    const member = team.find((t) => t.user_id === userId);
    setBusyId(bookingId);
    const { error: err } = await supabase.from('bookings').update({
      assigned_to: userId || null,
      assigned_employee_id: member?.id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', bookingId);
    if (err) setError(err.message);
    else await load();
    setBusyId(null);
  };

  const allTabs: { id: Tab; label: string; count: number; show: boolean }[] = [
    { id: 'quotes', label: 'Quotes', count: quotes.length, show: true },
    { id: 'unassigned', label: 'Unassigned', count: unassigned.length, show: true },
    { id: 'cash', label: 'Cash', count: cash.length, show: canCash },
    { id: 'tasks', label: 'Overdue tasks', count: tasks.length, show: true },
  ];
  const tabs = allTabs.filter((t) => t.show);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Work queue</h1>
        <p className="text-sm text-slate-400">Approve quotes, assign jobs, and clear overdue work.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] px-3 rounded-xl text-sm font-medium whitespace-nowrap ${
              tab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {t.label} {t.count > 0 && <span className="ml-1 opacity-70">{t.count}</span>}
          </button>
        ))}
      </div>

      {canApprove && (tab === 'quotes') && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Review note (required to reject)"
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : tab === 'quotes' ? (
        quotes.length === 0 ? <Empty icon={Inbox} text="No pending quotes." /> : quotes.map((b) => (
          <article key={b.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
            <Header booking={b} />
            <Actions
              canApprove={canApprove}
              canMessage={canMessage}
              busy={busyId === b.id}
              onApprove={() => void review(b, 'approved')}
              onReject={() => void review(b, 'cancelled')}
              onChat={() => setChatBooking(b)}
            />
          </article>
        ))
      ) : tab === 'unassigned' ? (
        unassigned.length === 0 ? <Empty icon={UserPlus} text="Every upcoming job is assigned." /> : unassigned.map((b) => (
          <article key={b.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
            <Header booking={b} />
            {canManage ? (
              <select
                disabled={busyId === b.id}
                defaultValue=""
                onChange={(e) => { if (e.target.value) void assign(b.id, e.target.value); }}
                className="w-full min-h-[44px] text-sm border border-slate-200 rounded-xl px-3 bg-white"
              >
                <option value="">Assign to staff…</option>
                {team.filter((t) => t.user_id).map((t) => (
                  <option key={t.id} value={t.user_id!}>{t.full_name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-400">You can view these jobs. Assigning needs Manage bookings.</p>
            )}
          </article>
        ))
      ) : tab === 'cash' ? (
        cash.length === 0 ? <Empty icon={Inbox} text="No pending cash collections." /> : (
          <div className="space-y-2">
            {cash.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{c.reference}</p>
                  <p className="text-xs text-slate-500">{c.payable_type} · SLE {Number(c.amount_sle).toLocaleString()}</p>
                </div>
                <button type="button" onClick={onOpenCash} className="text-sm font-semibold text-emerald-700">Collect</button>
              </div>
            ))}
          </div>
        )
      ) : (
        tasks.length === 0 ? <Empty icon={ClipboardList} text="No overdue delegated tasks." /> : tasks.map((t) => (
          <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">{t.title}</p>
            <p className="text-xs text-slate-500 mt-1">Due {t.due_date ? fmtDate(t.due_date) : '—'} · {t.priority} · {t.status}</p>
          </div>
        ))
      )}

      {chatBooking && (
        <EmployeeBookingChat
          bookingId={chatBooking.id}
          clientName={chatBooking.contact_name}
          onClose={() => setChatBooking(null)}
        />
      )}
    </div>
  );
}

function Header({ booking }: { booking: QueueBooking }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{serviceName(booking)}</p>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{booking.status.replace('_', ' ')}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {fmtDate(booking.scheduled_date)}{booking.scheduled_time ? ` · ${booking.scheduled_time.slice(0, 5)}` : ''}
        {booking.location ? ` · ${booking.location}` : ''}
      </p>
      {booking.contact_name && <p className="text-xs text-slate-400 mt-0.5">{booking.contact_name}{booking.contact_phone ? ` · ${booking.contact_phone}` : ''}</p>}
    </div>
  );
}

function Actions({ canApprove, canMessage, busy, onApprove, onReject, onChat }: {
  canApprove: boolean; canMessage: boolean; busy: boolean;
  onApprove: () => void; onReject: () => void; onChat: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {canApprove && (
        <>
          <button type="button" disabled={busy} onClick={onApprove} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
          </button>
          <button type="button" disabled={busy} onClick={onReject} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold disabled:opacity-50">
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
        </>
      )}
      {canMessage && (
        <button type="button" onClick={onChat} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold">
          <MessageSquare className="w-3.5 h-3.5" /> Message
        </button>
      )}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Inbox; text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
      <Icon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      {text}
    </div>
  );
}
