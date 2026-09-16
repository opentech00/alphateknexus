/**
 * Official Alphatek Global SL Limited invoice / receipt documents.
 * Keep in sync with supabase/functions/_shared/companyDocs.ts (browser vs Deno runtimes).
 */

export const COMPANY = {
  legalName: 'Alphatek Global SL Limited',
  shortName: 'Alphatek',
  groupName: 'Alphatek Global Group',
  street: '50 Bismark Johnson Street Freetown,',
  city: 'Western Area 00232',
  phones: '+232 (72) 322372/+232 (78) 308536',
  tin: '1001158962',
  emailFrom: 'Alphatek Global SL Limited <noreply@alphateknexus.com>',
} as const;

export const COMPANY_BANKS: { name: string; account: string }[] = [
  { name: 'Access Bank', account: '0070100000297' },
  { name: 'Bloom Bank', account: '0012030479707' },
  { name: 'CMB Bank', account: '0021180921367' },
  { name: 'Eco Bank', account: '6340044090' },
  { name: 'Vista Bank', account: '600012222120190' },
  { name: 'UTB Bank', account: '004001142295120158' },
];

export const COMPANY_SIGNATORY = {
  name: 'Alusine Gibriel Braima',
  title: 'Admin/Finance Officer',
} as const;

export interface OfficialLineItem {
  item?: string;
  description?: string;
  unit_price?: number;
  quantity?: number | string;
  trips?: string | number;
  total?: number;
}

export interface BankAccount {
  name: string;
  account: string;
}

export interface InvoiceLetterhead {
  brandName: string;
  legalLine: string;
  groupLine: string;
  address: string;
  phones: string;
  tin: string;
  logoUrl: string;
  officerName: string;
  officerTitle: string;
  banks: BankAccount[];
}

export function defaultLetterhead(): InvoiceLetterhead {
  return {
    brandName: COMPANY.shortName,
    legalLine: 'GLOBAL SL LIMITED',
    groupLine: 'GLOBAL GROUP',
    address: `${COMPANY.street}\n${COMPANY.city}`,
    phones: COMPANY.phones,
    tin: COMPANY.tin,
    logoUrl: '',
    officerName: COMPANY_SIGNATORY.name,
    officerTitle: COMPANY_SIGNATORY.title,
    banks: COMPANY_BANKS.map((b) => ({ name: b.name, account: b.account })),
  };
}

export function mergeLetterhead(partial?: Partial<InvoiceLetterhead> | null): InvoiceLetterhead {
  const base = defaultLetterhead();
  if (!partial) return base;
  const banks = Array.isArray(partial.banks) && partial.banks.length > 0
    ? partial.banks.map((b) => ({ name: String(b?.name || ''), account: String(b?.account || '') }))
    : base.banks;
  return {
    brandName: partial.brandName?.trim() || base.brandName,
    legalLine: partial.legalLine?.trim() || base.legalLine,
    groupLine: partial.groupLine?.trim() || base.groupLine,
    address: partial.address?.trim() || base.address,
    phones: partial.phones?.trim() || base.phones,
    tin: partial.tin?.trim() || base.tin,
    logoUrl: partial.logoUrl?.trim() || '',
    officerName: partial.officerName?.trim() || base.officerName,
    officerTitle: partial.officerTitle?.trim() || base.officerTitle,
    banks,
  };
}

export function officerScribble(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const initials = parts.slice(0, -1).map((p) => p[0]?.toUpperCase() || '').filter(Boolean).join('.');
  return `${initials}. ${parts[parts.length - 1]}`;
}

export interface InvoiceNotesMeta {
  billToName?: string;
  billToAddress?: string;
  notes?: string;
  letterhead?: InvoiceLetterhead;
}

export interface OfficialInvoiceInput {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency?: string;
  subtotal: number;
  discountRate: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  notes?: string | null;
  lineItems: OfficialLineItem[];
  billToName: string;
  billToAddress?: string | null;
  billToEmail?: string | null;
  billToPhone?: string | null;
  letterhead?: Partial<InvoiceLetterhead> | null;
}

export interface OfficialReceiptInput {
  receiptNumber: string;
  reference: string;
  amountSle: number;
  currency?: string;
  purpose?: string;
  description?: string | null;
  paymentMethod?: string;
  paymentId?: string | null;
  paidAt: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
}

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDocDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const raw = typeof value === 'string' ? value : value.toISOString();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function formatLe(amount: number, opts?: { parens?: boolean; minus?: boolean }): string {
  const n = Number(amount) || 0;
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const body = n < 0 || opts?.minus ? `-Le ${abs}` : `Le ${abs}`;
  return opts?.parens ? `(${body})` : body;
}

export function parseTripsMultiplier(trips: string | number | undefined, quantity?: number | string): number {
  if (typeof trips === 'number' && Number.isFinite(trips) && trips > 0) return trips;
  const fromTrips = String(trips ?? '').trim().match(/^(\d+(?:\.\d+)?)/);
  if (fromTrips) return Number(fromTrips[1]) || 1;
  const q = Number(quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

export function tripsLabel(item: OfficialLineItem): string {
  const trips = item.trips;
  if (trips !== undefined && trips !== null && String(trips).trim() !== '') return String(trips);
  const q = item.quantity;
  if (q !== undefined && q !== null && String(q).trim() !== '') return String(q);
  return '1';
}

export function lineItemSubtotal(item: OfficialLineItem): number {
  if (item.total != null && Number.isFinite(Number(item.total))) return Number(item.total);
  return (Number(item.unit_price) || 0) * parseTripsMultiplier(item.trips, item.quantity);
}

export function parseInvoiceNotes(notes: string | null | undefined): InvoiceNotesMeta {
  if (!notes || !notes.trim()) return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const billToName = typeof parsed.bill_to_name === 'string' ? parsed.bill_to_name : undefined;
      const billToAddress = typeof parsed.bill_to_address === 'string' ? parsed.bill_to_address : undefined;
      const inner = typeof parsed.notes === 'string' ? parsed.notes : undefined;
      const letterhead = parsed.letterhead && typeof parsed.letterhead === 'object'
        ? mergeLetterhead(parsed.letterhead)
        : undefined;
      if (billToName || billToAddress || letterhead || 'notes' in parsed || 'bill_to_name' in parsed || 'letterhead' in parsed) {
        return { billToName, billToAddress, notes: inner, letterhead };
      }
    }
  } catch {
    /* plain notes */
  }
  return { notes };
}

export function serializeInvoiceNotes(meta: InvoiceNotesMeta): string | null {
  const billToName = meta.billToName?.trim() || '';
  const billToAddress = meta.billToAddress?.trim() || '';
  const notes = meta.notes?.trim() || '';
  const letterhead = meta.letterhead ? mergeLetterhead(meta.letterhead) : undefined;
  if (!billToName && !billToAddress && !letterhead) return notes || null;
  return JSON.stringify({
    bill_to_name: billToName || null,
    bill_to_address: billToAddress || null,
    notes: notes || null,
    letterhead: letterhead || null,
  });
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function chunkToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`.trim();
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + chunkToWords(n % 100) : ''}`;
}

export function amountInWords(amount: number, currencyWord = 'Leones'): string {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const sign = n < 0 ? 'Negative ' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const cents = Math.round((abs - whole) * 100);
  if (whole === 0 && cents === 0) return `Zero ${currencyWord}.`;

  const scales = [
    { v: 1_000_000_000, w: 'Billion' },
    { v: 1_000_000, w: 'Million' },
    { v: 1_000, w: 'Thousand' },
  ];
  let remaining = whole;
  const parts: string[] = [];
  for (const s of scales) {
    if (remaining >= s.v) {
      const count = Math.floor(remaining / s.v);
      parts.push(`${chunkToWords(count)} ${s.w}`);
      remaining %= s.v;
    }
  }
  if (remaining > 0 || parts.length === 0) parts.push(chunkToWords(remaining));
  let out = `${sign}${parts.filter(Boolean).join(' ')} ${currencyWord}`;
  if (cents > 0) out += ` and ${chunkToWords(cents)} Cent${cents === 1 ? '' : 's'}`;
  return `${out}.`;
}

export function purposeLabel(purpose?: string | null): string {
  switch (purpose) {
    case 'wallet_topup': return 'Wallet Top-Up';
    case 'wallet_payment': return 'Wallet Payment';
    case 'wallet_refund': return 'Wallet Refund';
    case 'wallet_adjustment': return 'Wallet Adjustment';
    case 'invoice': return 'Invoice Payment';
    case 'subscription': return 'Subscription Payment';
    default: return purpose ? purpose.replace(/_/g, ' ') : 'Payment';
  }
}

const LOGO_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="54" height="54" aria-hidden="true">
  <path fill="#2b2b2b" d="M40 4 8 76h16.4l4.8-11.2h21.6L55.6 76H72L40 4zm0 22.5L29.2 52.2h21.6L40 26.5z"/>
  <path fill="#fff" d="M40 32.2 32.8 48h14.4L40 32.2z"/>
</svg>`;

function brandBlock(lh: InvoiceLetterhead, variant: 'company' | 'group', compact = false): string {
  const legal = variant === 'group' ? lh.groupLine : lh.legalLine;
  const size = compact ? '20px' : '28px';
  const imgH = compact ? 40 : 54;
  const mark = lh.logoUrl
    ? `<img src="${esc(lh.logoUrl)}" alt="" style="height:${imgH}px;width:auto;max-width:120px;object-fit:contain;display:block"/>`
    : (compact ? LOGO_MARK.replace('width="54" height="54"', 'width="40" height="40"') : LOGO_MARK);
  return `<div class="brand ${compact ? 'brand-sm' : ''}">
    <div class="mark">${mark}</div>
    <div class="wordmark">
      <div class="name" style="font-size:${size}">${esc(lh.brandName)}</div>
      <div class="legal">${esc(legal)}</div>
    </div>
  </div>`;
}

function documentCss(): string {
  return `
    @page { size: A4; margin: 14mm 12mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      background: #ececec;
      color: #1a1a1a;
      font-family: Calibri, 'Segoe UI', Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.35;
    }
    .sheet {
      width: 210mm; min-height: 297mm; max-width: 100%;
      margin: 16px auto; background: #fff;
      padding: 16mm 16mm 14mm;
      box-shadow: 0 2px 10px rgba(0,0,0,.08);
    }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 8px; }
    .brand .mark { flex: none; line-height: 0; }
    .brand .name {
      font-weight: 700; letter-spacing: -0.4px; color: #222;
      font-family: Cambria, Georgia, 'Times New Roman', serif;
      line-height: 1;
    }
    .brand .legal {
      font-size: 10px; font-weight: 700; letter-spacing: 0.8px;
      color: #333; margin-top: 3px; text-transform: uppercase;
    }
    .doc-title { font-size: 28px; font-weight: 400; margin: 4px 0 0; color: #111; }
    .company-meta { margin-top: 10px; font-size: 12.5px; color: #222; line-height: 1.45; }
    .meta-row { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
    .bill h3 { margin: 0 0 6px; font-size: 13px; font-weight: 700; }
    .bill p { margin: 0; white-space: pre-line; }
    .ids { min-width: 240px; }
    .ids table { border-collapse: collapse; margin-left: auto; }
    .ids td { padding: 2px 0 2px 16px; vertical-align: top; }
    .ids td.k { font-weight: 700; padding-right: 18px; }
    .ids td.v { font-weight: 700; text-align: right; }
    table.lines { width: 100%; border-collapse: collapse; margin-top: 22px; }
    table.lines th, table.lines td { border: 1px solid #9a9a9a; padding: 8px 8px; vertical-align: top; }
    table.lines th {
      background: #d9d9d9; font-size: 12px; font-weight: 700; text-align: center;
    }
    table.lines td.c { text-align: center; }
    table.lines td.r { text-align: right; white-space: nowrap; }
    table.lines td.item { font-weight: 600; width: 22%; }
    table.lines td.desc { width: 38%; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 0; }
    .totals { width: 46%; border-collapse: collapse; margin-top: -1px; }
    .totals td { padding: 6px 10px; font-size: 13px; border: 1px solid #9a9a9a; }
    .totals td.k { font-weight: 700; width: 58%; }
    .totals td.v { text-align: right; font-weight: 600; white-space: nowrap; }
    .totals tr.bar td { background: #d9d9d9; }
    .words { margin-top: 16px; text-align: right; font-style: italic; font-size: 13px; }
    .sign { margin-top: 36px; }
    .sign .scribble {
      font-family: 'Segoe Script', 'Brush Script MT', cursive;
      font-size: 28px; color: #222; line-height: 1; margin-bottom: 2px;
    }
    .sign .who { font-weight: 700; }
    .sign .role { font-size: 12.5px; }
    .foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 40px; }
    .banks h3 { margin: 0 0 8px; font-size: 13px; }
    .banks table { border-collapse: collapse; }
    .banks td { padding: 1px 18px 1px 0; font-size: 12.5px; }
    .banks td.k { font-weight: 700; padding-right: 6px; }
    .banks td.colon { padding-right: 10px; font-weight: 700; }
    .paid-stamp {
      display: inline-block; margin-top: 10px; padding: 4px 10px;
      border: 2px solid #1b7f3a; color: #1b7f3a; font-weight: 800;
      letter-spacing: 1px; font-size: 12px; transform: rotate(-6deg);
    }
    @media print {
      body { background: #fff; }
      .sheet { margin: 0; box-shadow: none; width: auto; min-height: 0; padding: 0; }
    }
  `;
}

function header(title: string, lh: InvoiceLetterhead): string {
  const addr = esc(lh.address).replace(/\n/g, '<br/>');
  return `<div class="top">
    <div>
      ${brandBlock(lh, 'company')}
      <div class="company-meta">
        ${addr}<br/>
        ${esc(lh.phones)}<br/>
        TIN: ${esc(lh.tin)}
      </div>
    </div>
    <h1 class="doc-title">${esc(title)}</h1>
  </div>`;
}

function banksAndFooter(lh: InvoiceLetterhead): string {
  const rows = (lh.banks || []).filter((b) => b.name || b.account).map((b) =>
    `<tr><td class="k">${esc(b.name)}</td><td class="colon">:</td><td>${esc(b.account)}</td></tr>`
  ).join('');
  return `<div class="foot">
    <div class="banks">
      <h3>Bankers: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; SLe A/C</h3>
      <table>${rows}</table>
    </div>
    ${brandBlock(lh, 'group', true)}
  </div>`;
}

function signBlock(lh: InvoiceLetterhead): string {
  return `<div class="sign">
    <div class="scribble">${esc(officerScribble(lh.officerName))}</div>
    <div class="who">${esc(lh.officerName)}</div>
    <div class="role">${esc(lh.officerTitle)}</div>
  </div>`;
}

function billToBlock(name: string, address?: string | null, ids?: { k: string; v: string }[]): string {
  const idRows = (ids || []).map((r) =>
    `<tr><td class="k">${esc(r.k)}</td><td class="v">${esc(r.v)}</td></tr>`
  ).join('');
  return `<div class="meta-row">
    <div class="bill">
      <h3>Bill to:</h3>
      <p><strong>${esc(name || 'Client')}</strong>${address ? `<br/>${esc(address)}` : ''}</p>
    </div>
    <div class="ids"><table>${idRows}</table></div>
  </div>`;
}

function lineTable(items: OfficialLineItem[]): string {
  const rows = (items.length ? items : [{ item: '', description: '', unit_price: 0, trips: '', total: 0 }]).map((item) => {
    const itemName = item.item || (item.description || '').split(/[.\n]/)[0] || '';
    const desc = item.description || '';
    return `<tr>
      <td class="item">${esc(itemName)}</td>
      <td class="desc">${esc(desc)}</td>
      <td class="r">${esc(formatLe(Number(item.unit_price) || 0))}</td>
      <td class="c">${esc(tripsLabel(item))}</td>
      <td class="r">${esc(formatLe(lineItemSubtotal(item)))}</td>
    </tr>`;
  }).join('');
  return `<table class="lines">
    <thead>
      <tr>
        <th>Item</th>
        <th>Description</th>
        <th>Unit Price</th>
        <th>No. of Trips</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalsBlock(opts: {
  subtotal: number;
  discountRate: number;
  discountAmount: number;
  amountPaid: number;
  balance: number;
  paidLabel?: string;
}): string {
  const rate = Number(opts.discountRate) || 0;
  return `<div class="totals-wrap"><table class="totals">
    <tr class="bar"><td class="k">Total:</td><td class="v">${esc(formatLe(opts.subtotal))}</td></tr>
    <tr><td class="k">Discount (${esc(String(rate))}%)</td><td class="v">${esc(formatLe(opts.discountAmount, { parens: true }))}</td></tr>
    <tr><td class="k">${esc(opts.paidLabel || 'Paid:')}</td><td class="v">${esc(formatLe(opts.amountPaid, { minus: true }))}</td></tr>
    <tr class="bar"><td class="k">Balance Due:</td><td class="v">${esc(formatLe(opts.balance))}</td></tr>
  </table></div>`;
}

export function buildOfficialInvoiceHtml(inv: OfficialInvoiceInput): string {
  const parsed = parseInvoiceNotes(inv.notes);
  const lh = mergeLetterhead(inv.letterhead || parsed.letterhead);
  const billName = inv.billToName || parsed.billToName || 'Client';
  const billAddress = [inv.billToAddress || parsed.billToAddress, inv.billToPhone, inv.billToEmail]
    .filter(Boolean)
    .join('\n');
  const subtotal = Number(inv.subtotal) || 0;
  const discountAmount = Number(inv.discountAmount) || 0;
  const amountPaid = Number(inv.amountPaid) || 0;
  const storedTotal = Number(inv.total);
  const net = Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : Math.max(0, subtotal - discountAmount);
  const balance = Math.max(0, net - amountPaid);
  const extraNotes = parsed.notes || '';

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/>
<title>Invoice ${esc(inv.invoiceNumber)}</title>
<style>${documentCss()}</style>
</head><body>
<div class="sheet">
  ${header('Invoice', lh)}
  ${billToBlock(billName, billAddress, [
    { k: 'Invoice #', v: inv.invoiceNumber },
    { k: 'Invoice Date', v: formatDocDate(inv.issueDate) },
    { k: 'Due Date', v: formatDocDate(inv.dueDate) },
  ])}
  ${lineTable(inv.lineItems || [])}
  ${totalsBlock({
    subtotal,
    discountRate: inv.discountRate,
    discountAmount,
    amountPaid,
    balance,
  })}
  <div class="words">Amount in words: ${esc(amountInWords(net))}</div>
  ${extraNotes ? `<p style="margin-top:18px;font-size:12px;color:#444">${esc(extraNotes)}</p>` : ''}
  ${amountPaid > 0 && balance <= 0 ? '<div class="paid-stamp">PAID</div>' : ''}
  ${signBlock(lh)}
  ${banksAndFooter(lh)}
</div>
</body></html>`;
}

export function buildOfficialReceiptHtml(r: OfficialReceiptInput): string {
  const amount = Number(r.amountSle) || 0;
  const paidAt = r.paidAt;
  const itemName = purposeLabel(r.purpose);
  const description = r.description || itemName;
  const method = (r.paymentMethod || 'payment').replace(/_/g, ' ');
  const address = [r.clientAddress, r.clientPhone, r.clientEmail].filter(Boolean).join('\n');
  const lh = defaultLetterhead();

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/>
<title>Receipt ${esc(r.receiptNumber)}</title>
<style>${documentCss()}</style>
</head><body>
<div class="sheet">
  ${header('Receipt', lh)}
  ${billToBlock(r.clientName || 'Client', address, [
    { k: 'Receipt #', v: r.receiptNumber },
    { k: 'Invoice / Ref', v: r.reference },
    { k: 'Receipt Date', v: formatDocDate(paidAt) },
  ])}
  ${lineTable([{
    item: itemName,
    description: `${description}${method ? `\nPayment method: ${method}` : ''}${r.paymentId ? `\nTransaction ID: ${r.paymentId}` : ''}`,
    unit_price: amount,
    trips: '1',
    quantity: 1,
    total: amount,
  }])}
  ${totalsBlock({
    subtotal: amount,
    discountRate: 0,
    discountAmount: 0,
    amountPaid: amount,
    balance: 0,
  })}
  <div class="words">Amount in words: ${esc(amountInWords(amount))}</div>
  <div class="paid-stamp">PAID</div>
  ${signBlock(lh)}
  ${banksAndFooter(lh)}
</div>
</body></html>`;
}

export function buildReceiptHtmlFromRow(
  r: {
    receipt_number: string;
    reference: string;
    amount_sle: number;
    currency?: string;
    purpose?: string;
    description?: string | null;
    payment_method?: string;
    payment_id?: string | null;
    paid_at: string;
  },
  client?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    recipient_email?: string | null;
  },
): string {
  return buildOfficialReceiptHtml({
    receiptNumber: r.receipt_number,
    reference: r.reference,
    amountSle: r.amount_sle,
    currency: r.currency,
    purpose: r.purpose,
    description: r.description,
    paymentMethod: r.payment_method,
    paymentId: r.payment_id,
    paidAt: r.paid_at,
    clientName: client?.full_name,
    clientEmail: client?.email || client?.recipient_email,
    clientPhone: client?.phone,
    clientAddress: client?.address,
  });
}

export function openPrintableHtml(html: string, filename = 'document.html'): void {
  if (typeof window === 'undefined') return;
  const tab = window.open('', '_blank', 'noopener,noreferrer');
  if (!tab) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  tab.document.open();
  tab.document.write(html);
  tab.document.close();
  tab.focus();
  window.setTimeout(() => {
    try { tab.print(); } catch { /* ignore */ }
  }, 350);
}
