import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileText, ImagePlus, Loader2, Plus, Printer, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { fetchMediaAsset, fallbackLogo } from '../../../lib/media';
import {
  amountInWords,
  buildOfficialInvoiceHtml,
  defaultLetterhead,
  formatDocDate,
  formatLe,
  mergeLetterhead,
  officerScribble,
  openPrintableHtml,
  parseInvoiceNotes,
  parseTripsMultiplier,
  serializeInvoiceNotes,
  type InvoiceLetterhead,
  type OfficialLineItem,
} from '../../../lib/companyDocs';

export interface InvoiceLineDraft {
  item: string;
  description: string;
  unit_price: number;
  trips: string;
  total: number;
}

export function emptyLine(): InvoiceLineDraft {
  return { item: '', description: '', unit_price: 0, trips: '1', total: 0 };
}

export function toStoredLine(line: InvoiceLineDraft): OfficialLineItem {
  const qty = parseTripsMultiplier(line.trips, 1);
  return {
    item: line.item.trim(),
    description: line.description.trim(),
    unit_price: line.unit_price,
    quantity: qty,
    trips: line.trips.trim() || String(qty),
    total: line.unit_price * qty,
  };
}

export function fromStoredLine(item: OfficialLineItem): InvoiceLineDraft {
  return {
    item: item.item || '',
    description: item.description || '',
    unit_price: Number(item.unit_price) || 0,
    trips: item.trips != null && String(item.trips) !== '' ? String(item.trips) : String(item.quantity ?? 1),
    total: Number(item.total) || 0,
  };
}

export function invoiceTotals(lines: InvoiceLineDraft[], discountRate: number, amountPaid = 0) {
  const subtotal = lines.reduce((s, l) => s + (Number(l.unit_price) || 0) * parseTripsMultiplier(l.trips, 1), 0);
  const discountAmount = subtotal * (Number(discountRate) || 0) / 100;
  const total = Math.max(0, subtotal - discountAmount);
  const balance = Math.max(0, total - (Number(amountPaid) || 0));
  return { subtotal, discountAmount, total, balance };
}

const inputClass = 'w-full bg-transparent border-0 border-b border-slate-300 px-0 py-1 text-sm text-slate-900 focus:border-slate-700 focus:ring-0 outline-none';
const cellInput = 'w-full bg-transparent border-0 px-1 py-1 text-sm text-slate-900 focus:bg-amber-50 outline-none';
const LETTERHEAD_KEY = 'atn-invoice-letterhead';

function loadSavedLetterhead(): InvoiceLetterhead {
  try {
    const raw = localStorage.getItem(LETTERHEAD_KEY);
    if (raw) return mergeLetterhead(JSON.parse(raw));
  } catch { /* ignore */ }
  return defaultLetterhead();
}

function saveLetterhead(lh: InvoiceLetterhead) {
  try { localStorage.setItem(LETTERHEAD_KEY, JSON.stringify(lh)); } catch { /* ignore */ }
}

async function compressLogoFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read logo'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image'));
    el.src = dataUrl;
  });
  const max = 360;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function LogoMark({ compact = false, src }: { compact?: boolean; src?: string }) {
  const size = compact ? 40 : 52;
  if (src) {
    return <img src={src} alt="Company logo" style={{ height: size, width: 'auto', maxWidth: 120, objectFit: 'contain' }} />;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
      <path fill="#2b2b2b" d="M40 4 8 76h16.4l4.8-11.2h21.6L55.6 76H72L40 4zm0 22.5L29.2 52.2h21.6L40 26.5z" />
      <path fill="#fff" d="M40 32.2 32.8 48h14.4L40 32.2z" />
    </svg>
  );
}

function Brand({
  variant, compact = false, letterhead,
}: {
  variant: 'company' | 'group';
  compact?: boolean;
  letterhead: InvoiceLetterhead;
}) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark compact={compact} src={letterhead.logoUrl} />
      <div>
        <div className={`font-serif font-bold leading-none text-slate-900 ${compact ? 'text-xl' : 'text-[28px]'}`}>
          {letterhead.brandName}
        </div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-800">
          {variant === 'group' ? letterhead.groupLine : letterhead.legalLine}
        </div>
      </div>
    </div>
  );
}

export function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [userId, setUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [billToName, setBillToName] = useState('');
  const [billToAddress, setBillToAddress] = useState('');
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('atn-inv-001');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  const [discountRate, setDiscountRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineDraft[]>([emptyLine()]);
  const [letterhead, setLetterhead] = useState<InvoiceLetterhead>(() => loadSavedLetterhead());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const patchLetterhead = (patch: Partial<InvoiceLetterhead>) => {
    setLetterhead((prev) => mergeLetterhead({ ...prev, ...patch }));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('peek_atn_invoice_number');
      if (!cancelled && typeof data === 'string' && data) {
        setNextInvoiceNumber(data);
      } else {
        const { data: rows } = await supabase.from('invoices').select('invoice_number');
        const max = (rows || []).reduce((m: number, r: { invoice_number: string }) => {
          const match = String(r.invoice_number || '').match(/^atn-inv-(\d+)$/);
          return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, 0);
        if (!cancelled) setNextInvoiceNumber(`atn-inv-${String(max + 1).padStart(3, '0')}`);
      }
      const saved = loadSavedLetterhead();
      if (saved.logoUrl) {
        if (!cancelled) setLetterhead(saved);
        return;
      }
      const asset = await fetchMediaAsset('app_logo', 'app-logo');
      const logoUrl = asset?.file_url || fallbackLogo();
      if (!cancelled) setLetterhead(mergeLetterhead({ ...saved, logoUrl }));
    })();
    return () => { cancelled = true; };
  }, []);

  const { subtotal, discountAmount, total, balance } = useMemo(
    () => invoiceTotals(lineItems, parseFloat(discountRate) || 0),
    [lineItems, discountRate],
  );

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, address')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setUserResults(data || []);
  };

  const selectClient = async (u: any) => {
    setUserId(u.id);
    setUserSearch(`${u.full_name || u.email || ''}`);
    setUserResults([]);
    const { data: bookings } = await supabase
      .from('bookings')
      .select('details, location')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(8);
    const company = (bookings || []).map((b: any) => b.details?.company_name || b.details?.company).find(Boolean);
    const loc = (bookings || []).map((b: any) => b.location || b.details?.address || b.details?.location).find(Boolean);
    setBillToName(company || u.full_name || u.email || '');
    const addrParts = [loc || u.address, u.phone, u.email].filter(Boolean);
    setBillToAddress(addrParts.join('\n'));
  };

  const updateLine = (idx: number, patch: Partial<InvoiceLineDraft>) => {
    setLineItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, ...patch };
      next.total = (Number(next.unit_price) || 0) * parseTripsMultiplier(next.trips, 1);
      return next;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!userId) { setError('Select a client'); return; }
    if (!billToName.trim()) { setError('Bill-to name is required'); return; }
    if (lineItems.some((i) => !i.item.trim() && !i.description.trim())) {
      setError('Each line needs an item or description');
      return;
    }
    setSubmitting(true);
    const storedLines = lineItems.map(toStoredLine);
    saveLetterhead(letterhead);
    const letterheadToStore = {
      ...letterhead,
      logoUrl: letterhead.logoUrl && !letterhead.logoUrl.startsWith('data:') && !letterhead.logoUrl.startsWith('http')
        ? new URL(letterhead.logoUrl, window.location.origin).href
        : letterhead.logoUrl,
    };
    const payload = {
      user_id: userId,
      status: 'sent',
      issue_date: issueDate,
      due_date: dueDate,
      currency: 'SLE',
      subtotal,
      tax_rate: parseFloat(discountRate) || 0,
      tax_amount: discountAmount,
      total,
      invoice_number: nextInvoiceNumber,
      notes: serializeInvoiceNotes({ billToName, billToAddress, notes, letterhead: letterheadToStore }),
      line_items: storedLines,
    };

    const { data: canManage } = await supabase.rpc('has_finance_permission', { perm: 'can_manage_invoices' });
    const { data: isSuper } = await supabase.rpc('is_super_admin');
    if (!canManage && !isSuper) {
      const { error: rpcErr } = await supabase.rpc('create_finance_approval', {
        p_kind: 'invoice',
        p_payload: payload,
        p_related_id: null,
        p_note: notes.trim() || null,
        p_submit: true,
      });
      setSubmitting(false);
      if (rpcErr) { setError(rpcErr.message); return; }
      onCreated();
      return;
    }
    const { error: err } = await supabase.from('invoices').insert({
      ...payload,
      amount_paid: 0,
      created_by: 'admin',
    });
    setSubmitting(false);
    if (err) {
      if (String(err.message || '').toLowerCase().includes('duplicate') || err.code === '23505') {
        const next = nextInvoiceNumber.replace(/(\d+)$/, (n) => String(parseInt(n, 10) + 1).padStart(3, '0'));
        setNextInvoiceNumber(next);
        setError('That invoice number was just used. Try Create again.');
        return;
      }
      setError(err.message);
      return;
    }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="bg-[#ececec] rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-800" />
            <h2 className="text-lg font-bold text-slate-900">Create Invoice</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-3 sm:px-6 py-4">
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
          <div className="mb-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Client account</label>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Search client by name or email…"
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-400 outline-none"
            />
            {userResults.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-40 overflow-y-auto">
                {userResults.map((u) => (
                  <button key={u.id} type="button" onClick={() => selectClient(u)}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0">
                    <p className="text-sm font-medium text-slate-800">{u.full_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </button>
                ))}
              </div>
            )}
            {userId && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Client linked — bill-to details can still be edited on the invoice</p>}
          </div>

          <PaperSheet>
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => logoInputRef.current?.click()}
                    className="group relative flex-none rounded-md border border-dashed border-slate-300 p-1 hover:border-slate-500"
                    title="Change logo">
                    <LogoMark src={letterhead.logoUrl} />
                    <span className="absolute inset-0 hidden items-center justify-center bg-white/70 text-slate-600 group-hover:flex">
                      <ImagePlus className="w-4 h-4" />
                    </span>
                  </button>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try {
                        patchLetterhead({ logoUrl: await compressLogoFile(file) });
                      } catch (err: any) {
                        setError(err.message || 'Could not use that logo');
                      }
                    }} />
                  <div className="flex-1 min-w-0">
                    <input value={letterhead.brandName} onChange={(e) => patchLetterhead({ brandName: e.target.value })}
                      className={`${inputClass} font-serif font-bold text-[28px] leading-none`} />
                    <input value={letterhead.legalLine} onChange={(e) => patchLetterhead({ legalLine: e.target.value })}
                      className={`${inputClass} mt-1 text-[10px] font-bold uppercase tracking-[0.08em]`} />
                  </div>
                </div>
                <textarea value={letterhead.address} onChange={(e) => patchLetterhead({ address: e.target.value })} rows={2}
                  placeholder="Company address"
                  className="mt-2.5 w-full bg-transparent border-0 px-0 py-0 text-[13px] leading-snug resize-none outline-none" />
                <input value={letterhead.phones} onChange={(e) => patchLetterhead({ phones: e.target.value })}
                  placeholder="Phone numbers"
                  className={`${inputClass} text-[13px]`} />
                <div className="flex items-center gap-2 mt-0.5 text-[13px]">
                  <span className="text-slate-700">TIN:</span>
                  <input value={letterhead.tin} onChange={(e) => patchLetterhead({ tin: e.target.value })}
                    className={`${inputClass} flex-1`} />
                </div>
              </div>
              <h1 className="text-[28px] font-normal text-slate-900">Invoice</h1>
            </div>

            <div className="mt-8 flex justify-between gap-6">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm mb-1">Bill to:</p>
                <input value={billToName} onChange={(e) => setBillToName(e.target.value)} placeholder="Company or client name"
                  className={`${inputClass} font-semibold`} />
                <textarea value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} rows={3}
                  placeholder="Address"
                  className="mt-1 w-full bg-transparent border-0 px-0 py-1 text-sm resize-none focus:ring-0 outline-none" />
              </div>
              <table className="text-sm shrink-0">
                <tbody>
                  <tr>
                    <td className="font-bold pr-4 py-1">Invoice #</td>
                    <td className="py-1 text-right font-mono font-bold">{nextInvoiceNumber}</td>
                  </tr>
                  <tr>
                    <td className="font-bold pr-4 py-1">Invoice Date</td>
                    <td className="py-1"><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`${inputClass} text-right font-bold`} /></td>
                  </tr>
                  <tr>
                    <td className="font-bold pr-4 py-1">Due Date</td>
                    <td className="py-1"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${inputClass} text-right font-bold`} /></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#d9d9d9]">
                    <th className="border border-[#9a9a9a] px-2 py-2 text-center font-bold">Item</th>
                    <th className="border border-[#9a9a9a] px-2 py-2 text-center font-bold">Description</th>
                    <th className="border border-[#9a9a9a] px-2 py-2 text-center font-bold whitespace-nowrap">Unit Price</th>
                    <th className="border border-[#9a9a9a] px-2 py-2 text-center font-bold whitespace-nowrap">No. of Trips</th>
                    <th className="border border-[#9a9a9a] px-2 py-2 text-center font-bold">Subtotal</th>
                    <th className="w-8 border-0" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="border border-[#9a9a9a] align-top w-[22%]">
                        <input value={item.item} onChange={(e) => updateLine(idx, { item: e.target.value })} placeholder="Item"
                          className={`${cellInput} font-semibold`} />
                      </td>
                      <td className="border border-[#9a9a9a] align-top">
                        <textarea value={item.description} onChange={(e) => updateLine(idx, { description: e.target.value })}
                          rows={2} placeholder="Description" className={`${cellInput} resize-none`} />
                      </td>
                      <td className="border border-[#9a9a9a] align-top w-28">
                        <input type="number" min="0" step="0.01" value={item.unit_price}
                          onChange={(e) => updateLine(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                          className={`${cellInput} text-right`} />
                      </td>
                      <td className="border border-[#9a9a9a] align-top w-28">
                        <input value={item.trips} onChange={(e) => updateLine(idx, { trips: e.target.value })}
                          placeholder="2x/Month" className={`${cellInput} text-center`} />
                      </td>
                      <td className="border border-[#9a9a9a] align-middle text-right px-2 font-semibold whitespace-nowrap">
                        {formatLe(item.total)}
                      </td>
                      <td className="align-top pl-1">
                        {lineItems.length > 1 && (
                          <button type="button" onClick={() => setLineItems((p) => p.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={() => setLineItems((p) => [...p, emptyLine()])}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>

            <div className="mt-0 flex justify-end">
              <table className="w-full max-w-sm text-sm border-collapse -mt-px">
                <tbody>
                  <tr className="bg-[#d9d9d9]">
                    <td className="border border-[#9a9a9a] px-3 py-1.5 font-bold">Total:</td>
                    <td className="border border-[#9a9a9a] px-3 py-1.5 text-right font-semibold">{formatLe(subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="border border-[#9a9a9a] px-3 py-1.5 font-bold">
                      Discount (
                      <input type="number" min="0" step="0.01" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)}
                        className="w-12 bg-white border border-slate-200 rounded px-1 py-0.5 text-center" />
                      %)
                    </td>
                    <td className="border border-[#9a9a9a] px-3 py-1.5 text-right">{formatLe(discountAmount, { parens: true })}</td>
                  </tr>
                  <tr>
                    <td className="border border-[#9a9a9a] px-3 py-1.5 font-bold">Paid:</td>
                    <td className="border border-[#9a9a9a] px-3 py-1.5 text-right">{formatLe(0, { minus: true })}</td>
                  </tr>
                  <tr className="bg-[#d9d9d9]">
                    <td className="border border-[#9a9a9a] px-3 py-1.5 font-bold">Balance Due:</td>
                    <td className="border border-[#9a9a9a] px-3 py-1.5 text-right font-semibold">{formatLe(balance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-right italic text-sm">Amount in words: {amountInWords(total)}</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Optional notes for the client…"
              className="mt-3 w-full bg-transparent border border-dashed border-slate-200 rounded-lg px-3 py-2 text-sm resize-none outline-none" />

            <div className="mt-8">
              <input value={letterhead.officerName} onChange={(e) => patchLetterhead({ officerName: e.target.value })}
                placeholder="Finance officer name"
                className={`${inputClass} font-bold`} />
              <p className="font-serif text-2xl text-slate-800 mt-1">{officerScribble(letterhead.officerName)}</p>
              <input value={letterhead.officerTitle} onChange={(e) => patchLetterhead({ officerTitle: e.target.value })}
                placeholder="Title"
                className={`${inputClass} text-sm`} />
            </div>

            <div className="mt-10 flex justify-between items-end gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm mb-2">Bankers: &nbsp;&nbsp;&nbsp; SLe A/C</p>
                <table className="text-[13px] w-full">
                  <tbody>
                    {letterhead.banks.map((b, idx) => (
                      <tr key={idx}>
                        <td className="pr-2 py-0.5 w-[38%]">
                          <input value={b.name} placeholder="Account name"
                            onChange={(e) => patchLetterhead({
                              banks: letterhead.banks.map((row, i) => i === idx ? { ...row, name: e.target.value } : row),
                            })}
                            className={`${inputClass} font-bold`} />
                        </td>
                        <td className="pr-2 font-bold">:</td>
                        <td>
                          <input value={b.account} placeholder="Account number"
                            onChange={(e) => patchLetterhead({
                              banks: letterhead.banks.map((row, i) => i === idx ? { ...row, account: e.target.value } : row),
                            })}
                            className={inputClass} />
                        </td>
                        <td className="w-6">
                          {letterhead.banks.length > 1 && (
                            <button type="button" onClick={() => patchLetterhead({ banks: letterhead.banks.filter((_, i) => i !== idx) })}
                              className="p-0.5 text-slate-400 hover:text-red-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button"
                  onClick={() => patchLetterhead({ banks: [...letterhead.banks, { name: '', account: '' }] })}
                  className="mt-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
                  + Add bank account
                </button>
              </div>
              <Brand variant="group" compact letterhead={letterhead} />
            </div>
          </PaperSheet>

          <button type="submit" disabled={submitting}
            className="mt-4 w-full py-3.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            {submitting ? 'Creating…' : 'Create invoice'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ViewInvoiceModal({
  invoice,
  onClose,
  onEmail,
  emailing,
}: {
  invoice: {
    invoice_number: string;
    issue_date: string;
    due_date: string;
    currency?: string;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    amount_paid: number;
    notes: string | null;
    line_items: OfficialLineItem[];
    profile?: { full_name: string | null; email: string | null; phone: string | null };
  };
  onClose: () => void;
  onEmail: () => void;
  emailing?: boolean;
}) {
  const parsed = parseInvoiceNotes(invoice.notes);
  const html = buildOfficialInvoiceHtml({
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    discountRate: invoice.tax_rate,
    discountAmount: invoice.tax_amount,
    total: invoice.total,
    amountPaid: invoice.amount_paid,
    notes: invoice.notes,
    lineItems: invoice.line_items || [],
    billToName: parsed.billToName || invoice.profile?.full_name || 'Client',
    billToAddress: parsed.billToAddress,
    billToEmail: invoice.profile?.email,
    billToPhone: invoice.profile?.phone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="bg-[#ececec] rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Invoice {invoice.invoice_number}</h2>
            <p className="text-xs text-slate-500">{formatDocDate(invoice.issue_date)} · Due {formatDocDate(invoice.due_date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => openPrintableHtml(html, `invoice-${invoice.invoice_number}.html`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button type="button" onClick={onEmail} disabled={emailing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold disabled:opacity-50">
              {emailing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Email'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-3 sm:p-4">
          <iframe title={`Invoice ${invoice.invoice_number}`} srcDoc={html} className="w-full min-h-[80vh] bg-white rounded-lg border border-slate-200" />
        </div>
      </div>
    </div>
  );
}

function PaperSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white text-slate-900 shadow-md mx-auto w-full max-w-[210mm] px-6 py-8 sm:px-10 sm:py-10">
      {children}
    </div>
  );
}
