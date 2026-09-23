import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertCircle, CheckCircle2, ClipboardList, Inbox, Loader2,
  MessageSquare, UserPlus, XCircle, CalendarDays,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { fmtDate } from '../types';
import { EmployeeBookingChat } from '../components/EmployeeBookingChat';
import { ServiceRequestExportMenu } from '../../components/ServiceRequestExportMenu';
import { bookingToExportRow } from '../../lib/exportServiceRequests';
import { isInternalDepartmentSlug } from '../../lib/capabilities';
import { FinanceDepartmentInbox } from './FinanceDepartmentInbox';
import type { WorkInboxTab } from '../lib/workNav';
import { toast } from '../../components/toast/toast';

export type { WorkInboxTab };

interface QueueBooking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
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

export interface WorkInboxProps {
  onOpenCash: () => void;
  onOpenTasks?: () => void;
  initialTab?: WorkInboxTab;
  focusBookingId?: string | null;
}

export function WorkInboxPage({
  onOpenCash,
  onOpenTasks,
  initialTab = 'mine',
  focusBookingId = null,
}: WorkInboxProps) {
  const { employee, user, hasCapability } = useAuth();
  const canApprove = hasCapability('div.approve_quotes');
  const canManage = hasCapability('div.manage_bookings');
  const canCash = hasCapability('div.cash_collections');
  const canMessage = hasCapability('div.message_clients') || hasCapability('div.view');
  const tablistId = useId();
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});

  const [tab, setTab] = useState<WorkInboxTab>(initialTab);
  const [mine, setMine] = useState<QueueBooking[]>([]);
  const [quotes, setQuotes] = useState<QueueBooking[]>([]);
  const [unassigned, setUnassigned] = useState<QueueBooking[]>([]);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [priceById, setPriceById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chatBooking, setChatBooking] = useState<QueueBooking | null>(null);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    if (!employee?.service_id) { setLoading(false); return; }
    if (isInternalDepartmentSlug(employee.services?.slug)) {
      setMine([]);
      setQuotes([]);
      setUnassigned([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const [mineRes, quoteRes, openRes, teamRes, cashRes, taskRes] = await Promise.all([
      user
        ? supabase
            .from('bookings')
            .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, contact_email, notes, created_at, details, user_id, assigned_to, review_note, services(name)')
            .eq('assigned_to', user.id)
            .not('status', 'eq', 'cancelled')
            .not('status', 'eq', 'completed')
            .order('scheduled_date', { ascending: true })
            .limit(60)
        : Promise.resolve({ data: [] }),
      supabase
        .from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, contact_email, notes, created_at, details, user_id, assigned_to, review_note, services(name)')
        .eq('service_id', employee.service_id)
        .in('status', ['pending_review', 'pending'])
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, contact_email, notes, created_at, details, user_id, assigned_to, review_note, services(name)')
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
    setMine((mineRes.data as QueueBooking[]) || []);
    setQuotes((quoteRes.data as QueueBooking[]) || []);
    setUnassigned((openRes.data as QueueBooking[]) || []);
    setTeam((teamRes.data as TeamMember[]) || []);
    setCash((cashRes.data as CashRow[]) || []);
    setTasks((taskRes.data as TaskRow[]) || []);
    setLoading(false);
  }, [employee?.service_id, employee?.services?.slug, user, canCash]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!focusBookingId || loading) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const fromMine = mine.find((b) => b.id === focusBookingId);
    if (fromMine) {
      setTab('mine');
      setDay(fromMine.scheduled_date < todayIso ? 'overdue' : fromMine.scheduled_date);
      return;
    }
    if (quotes.some((b) => b.id === focusBookingId)) setTab('quotes');
    else if (unassigned.some((b) => b.id === focusBookingId)) setTab('unassigned');
  }, [focusBookingId, loading, mine, quotes, unassigned]);

  useEffect(() => {
    if (!focusBookingId || loading) return;
    const el = itemRefs.current[focusBookingId];
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    el.focus();
  }, [focusBookingId, loading, tab]);

  const review = async (booking: QueueBooking, next: 'approved' | 'cancelled') => {
    if (!canApprove && next === 'approved') return;
    if (!note.trim() && next === 'cancelled') {
      setError('Add a note when rejecting a quote.');
      toast.error('Add a note when rejecting a quote.');
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
      toast.error(err.message);
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
      toast.success(next === 'approved' ? 'Quote approved' : 'Quote rejected');
      await load();
    }
    setBusyId(null);
  };

  const sendPrice = async (bookingId: string) => {
    const amount = Number(priceById[bookingId]);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a price in SLE');
      return;
    }
    setBusyId(bookingId);
    const { data, error: err } = await supabase.rpc('set_quote_price', {
      p_booking_id: bookingId,
      p_amount: amount,
    });
    setBusyId(null);
    if (err || data?.success === false) {
      toast.error(data?.error || err?.message || 'Could not send the price');
      return;
    }
    toast.success('Price sent to the client');
    await load();
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
    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      toast.success('Job assigned');
      await load();
    }
    setBusyId(null);
  };

  const allTabs: { id: WorkInboxTab; label: string; count: number; show: boolean }[] = [
    { id: 'mine', label: 'Assigned to me', count: mine.length, show: true },
    { id: 'quotes', label: 'Quotes', count: quotes.length, show: true },
    { id: 'unassigned', label: 'Unassigned', count: unassigned.length, show: true },
    { id: 'cash', label: 'Cash', count: cash.length, show: canCash },
    { id: 'tasks', label: 'Overdue tasks', count: tasks.length, show: true },
  ];
  const tabs = allTabs.filter((t) => t.show);
  const isInternal = isInternalDepartmentSlug(employee?.services?.slug);

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const ids = tabs.map((t) => t.id);
    const idx = ids.indexOf(tab);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = event.key === 'ArrowRight'
        ? ids[(idx + 1) % ids.length]
        : ids[(idx - 1 + ids.length) % ids.length];
      setTab(next);
      document.getElementById(`${tablistId}-${next}`)?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setTab(ids[0]);
      document.getElementById(`${tablistId}-${ids[0]}`)?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      setTab(ids[ids.length - 1]);
      document.getElementById(`${tablistId}-${ids[ids.length - 1]}`)?.focus();
    }
  };

  if (isInternal) {
    return <FinanceDepartmentInbox employee={employee} />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const overdueMine = mine.filter((b) => b.scheduled_date < today);
  const mineForDay = day === 'overdue' ? overdueMine : mine.filter((b) => b.scheduled_date === day);

  return (
    <div className="space-y-4 emp-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 id="employee-page-title" tabIndex={-1} className="text-lg font-bold text-slate-900 outline-none">Work inbox</h1>
          <p className="text-sm text-slate-400">Your jobs, quotes, unassigned work, and overdue tasks in one place.</p>
        </div>
        <ServiceRequestExportMenu
          documentTitle="Client Service Requests — Work Inbox"
          rows={Array.from(new Map([...mine, ...quotes, ...unassigned].map((b) => [b.id, b])).values()).map(bookingToExportRow)}
        />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      <div
        role="tablist"
        aria-label="Work inbox"
        className="flex gap-2 overflow-x-auto pb-1"
        onKeyDown={onTabKey}
      >
        {tabs.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              id={`${tablistId}-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${tablistId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-3 rounded-xl text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                selected ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center text-[11px] opacity-80" aria-label={`${t.count} items`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {canApprove && tab === 'quotes' && (
        <label className="block">
          <span className="sr-only">Review note, required to reject a quote</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Review note (required to reject)"
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
      )}

      <div
        role="tabpanel"
        id={`${tablistId}-panel`}
        aria-labelledby={`${tablistId}-${tab}`}
        aria-busy={loading}
      >
        {loading ? (
          <div className="flex justify-center py-12" role="status">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden="true" />
            <span className="sr-only">Loading inbox</span>
          </div>
        ) : tab === 'mine' ? (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Schedule days">
              {overdueMine.length > 0 && (
                <button
                  type="button"
                  role="option"
                  aria-selected={day === 'overdue'}
                  onClick={() => setDay('overdue')}
                  className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                    day === 'overdue' ? 'bg-red-600 text-white' : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  Overdue
                  <span className="block text-[10px] font-normal opacity-80">{overdueMine.length}</span>
                </button>
              )}
              {week.map((d) => {
                const count = mine.filter((b) => b.scheduled_date === d).length;
                const active = d === day;
                const label = new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
                return (
                  <button
                    key={d}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setDay(d)}
                    className={`min-h-[44px] min-w-[4.5rem] px-3 rounded-xl text-xs font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      active ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    {label}
                    {count > 0 && <span className="block text-[10px] font-normal opacity-80">{count} job{count === 1 ? '' : 's'}</span>}
                  </button>
                );
              })}
            </div>
            {mineForDay.length === 0 ? (
              <Empty icon={CalendarDays} text="No jobs assigned to you on this day." />
            ) : mineForDay.map((b, i) => (
              <article
                key={b.id}
                id={`work-item-${b.id}`}
                ref={(el) => { itemRefs.current[b.id] = el; }}
                tabIndex={-1}
                className={`emp-fade-in bg-white rounded-2xl border p-4 shadow-sm space-y-2 outline-none ${
                  focusBookingId === b.id ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Header booking={b} />
                {canMessage && (
                  <button
                    type="button"
                    onClick={() => setChatBooking(b)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Message
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : tab === 'quotes' ? (
          quotes.length === 0 ? <Empty icon={Inbox} text="No pending quotes." /> : quotes.map((b, i) => (
            <article
              key={b.id}
              id={`work-item-${b.id}`}
              ref={(el) => { itemRefs.current[b.id] = el; }}
              tabIndex={-1}
              className={`emp-fade-in bg-white rounded-2xl border p-4 shadow-sm space-y-2 mb-3 outline-none ${
                focusBookingId === b.id ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Header booking={b} />
              {canApprove && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex-1 text-xs font-medium text-slate-500">
                    Price (SLE)
                    <input
                      inputMode="decimal"
                      value={priceById[b.id] || ''}
                      onChange={(e) => setPriceById((prev) => ({ ...prev, [b.id]: e.target.value }))}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => void sendPrice(b.id)}
                    className="sm:self-end min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
                  >
                    Send price
                  </button>
                </div>
              )}
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
          unassigned.length === 0 ? <Empty icon={UserPlus} text="Every upcoming job is assigned." /> : unassigned.map((b, i) => (
            <article
              key={b.id}
              id={`work-item-${b.id}`}
              ref={(el) => { itemRefs.current[b.id] = el; }}
              tabIndex={-1}
              className={`emp-fade-in bg-white rounded-2xl border p-4 shadow-sm space-y-2 mb-3 outline-none ${
                focusBookingId === b.id ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Header booking={b} />
              {canManage ? (
                <label className="block">
                  <span className="sr-only">Assign {serviceName(b)} to staff</span>
                  <select
                    disabled={busyId === b.id}
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) void assign(b.id, e.target.value); }}
                    className="w-full min-h-[44px] text-sm border border-slate-200 rounded-xl px-3 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Assign to staff…</option>
                    {team.filter((t) => t.user_id).map((t) => (
                      <option key={t.id} value={t.user_id!}>{t.full_name}</option>
                    ))}
                  </select>
                </label>
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
                  <button
                    type="button"
                    onClick={onOpenCash}
                    className="min-h-[44px] px-3 text-sm font-semibold text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
                  >
                    Collect
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          tasks.length === 0 ? <Empty icon={ClipboardList} text="No overdue delegated tasks." /> : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={onOpenTasks}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                  <p className="text-xs text-slate-500 mt-1">Due {t.due_date ? fmtDate(t.due_date) : '—'} · {t.priority} · {t.status}</p>
                </button>
              ))}
            </div>
          )
        )}
      </div>

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

/** @deprecated Prefer WorkInboxPage */
export const WorkQueuePage = WorkInboxPage;

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
          <button type="button" disabled={busy} onClick={onApprove} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Approve
          </button>
          <button type="button" disabled={busy} onClick={onReject} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
            <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Reject
          </button>
        </>
      )}
      {canMessage && (
        <button type="button" onClick={onChat} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Message
        </button>
      )}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Inbox; text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
      <Icon className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
      {text}
    </div>
  );
}
