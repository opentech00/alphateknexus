import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { moneySLE } from '../../lib/money';

export function DueInvoicesBanner({ onOpen }: { onOpen: () => void }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [due, setDue] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [finance, smart] = await Promise.all([
        supabase.from('invoices').select('status, total, amount_paid').eq('user_id', user.id).in('status', ['sent', 'overdue']),
        supabase.from('smart_sort_invoices').select('status, amount_sle, amount_paid_sle').eq('user_id', user.id).in('status', ['pending', 'partial', 'overdue']),
      ]);
      if (cancelled) return;
      const rows = [
        ...(finance.data || []).map((r) => Number(r.total) - Number(r.amount_paid || 0)),
        ...(smart.data || []).map((r) => Number(r.amount_sle) - Number(r.amount_paid_sle || 0)),
      ].filter((n) => n > 0);
      setCount(rows.length);
      setDue(rows.reduce((s, n) => s + n, 0));
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (count === 0) return null;

  return (
    <div className="mx-4 sm:mx-0 mb-4 motion-safe:animate-[fadeInUp_0.35s_ease]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Receipt className="w-5 h-5 text-amber-700 flex-shrink-0" aria-hidden="true" />
        <p className="flex-1 text-sm text-amber-950">
          <span className="font-semibold">{count} invoice{count === 1 ? '' : 's'} due</span>
          <span className="text-amber-800"> · {moneySLE(due)} outstanding</span>
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="min-h-[44px] rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
        >
          Review and pay
        </button>
      </div>
    </div>
  );
}
