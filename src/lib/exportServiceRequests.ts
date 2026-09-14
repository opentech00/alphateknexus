import logoUrl from '../assets/alphateknexus_logo.png';

export type ExportFormat = 'pdf' | 'word';

export interface ServiceRequestExportRow {
  service: string;
  type: string;
  status: string;
  client: string;
  phone: string;
  email: string;
  company?: string;
  scheduled: string;
  location: string;
  submitted: string;
  notes?: string;
}

const COMPANY_NAME = 'Alphateknexus';
const NAVY = '#1e3a8a';
const LIME = '#65a30d';

const TABLE_HEADERS = [
  '#', 'Service', 'Type', 'Status', 'Client', 'Phone', 'Email',
  'Company', 'Scheduled', 'Location', 'Submitted', 'Notes',
];

let cachedLogo: string | null | undefined;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatWhen() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatExportStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatExportDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatExportDateTime(date?: string | null, time?: string | null) {
  const day = formatExportDate(date);
  if (!time) return day;
  return `${day} ${time.slice(0, 5)}`;
}

function serviceLabel(services: unknown): string {
  if (!services) return 'Service';
  if (Array.isArray(services)) {
    const first = services[0] as { name?: string } | undefined;
    return first?.name || 'Service';
  }
  return (services as { name?: string }).name || 'Service';
}

function detailsRecord(details: unknown): Record<string, unknown> {
  return details && typeof details === 'object' ? details as Record<string, unknown> : {};
}

export function bookingToExportRow(booking: {
  status?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  location?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  notes?: string | null;
  created_at?: string | null;
  details?: unknown;
  services?: unknown;
}): ServiceRequestExportRow {
  const details = detailsRecord(booking.details);
  const company = String(details.company_name || details.company || '').trim();
  return {
    service: serviceLabel(booking.services),
    type: details.quote_request === true ? 'Quote' : 'Hire',
    status: formatExportStatus(booking.status || 'pending'),
    client: booking.contact_name || '—',
    phone: booking.contact_phone || '—',
    email: booking.contact_email || '—',
    company: company || '—',
    scheduled: formatExportDateTime(booking.scheduled_date, booking.scheduled_time),
    location: booking.location || '—',
    submitted: formatExportDate(booking.created_at),
    notes: booking.notes || '—',
  };
}

async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) throw new Error('logo fetch failed');
    const blob = await res.blob();
    cachedLogo = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read logo'));
      reader.readAsDataURL(blob);
    });
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

function rowsToCells(rows: ServiceRequestExportRow[]): string[][] {
  return rows.map((row, index) => [
    String(index + 1),
    row.service,
    row.type,
    row.status,
    row.client,
    row.phone,
    row.email,
    row.company || '—',
    row.scheduled,
    row.location,
    row.submitted,
    row.notes || '—',
  ]);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportPdf(opts: {
  filename: string;
  documentTitle: string;
  headers: string[];
  cells: string[][];
}) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();

  if (logo) {
    doc.addImage(logo, 'PNG', 14, 7, 78, 20);
  }

  const titleX = logo ? 98 : 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 58, 138);
  doc.text(COMPANY_NAME, titleX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(opts.documentTitle, titleX, 21);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${formatWhen()}`, pageWidth - 14, 14, { align: 'right' });
  doc.text(`${opts.cells.length} record${opts.cells.length === 1 ? '' : 's'}`, pageWidth - 14, 19, { align: 'right' });

  doc.setDrawColor(101, 163, 13);
  doc.setLineWidth(1);
  doc.line(14, 30, pageWidth - 14, 30);

  autoTable(doc, {
    startY: 34,
    head: [opts.headers],
    body: opts.cells,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1.6,
      overflow: 'linebreak',
      valign: 'middle',
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8 },
      11: { cellWidth: 32 },
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `${COMPANY_NAME}  ·  ${opts.documentTitle}  ·  Page ${data.pageNumber}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );
    },
  });

  doc.save(opts.filename);
}

async function exportWord(opts: {
  filename: string;
  documentTitle: string;
  headers: string[];
  cells: string[][];
}) {
  const logo = await getLogoDataUrl();
  const headerCells = opts.headers
    .map((h) => `<th style="background:${NAVY};color:#fff;padding:8px 10px;text-align:left;font-size:10pt;border:1px solid ${NAVY};">${escapeHtml(h)}</th>`)
    .join('');
  const bodyRows = opts.cells.map((row, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const tds = row
      .map((cell) => `<td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:9pt;color:#0f172a;vertical-align:top;">${escapeHtml(cell)}</td>`)
      .join('');
    return `<tr style="background:${bg};">${tds}</tr>`;
  }).join('');

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(COMPANY_NAME)} — ${escapeHtml(opts.documentTitle)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { size: A4 landscape; margin: 1.4cm; }
    body { font-family: Calibri, Arial, sans-serif; color: #0f172a; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
    <tr>
      <td width="280" valign="middle" style="padding-right:18px;">
        ${logo ? `<img src="${logo}" alt="${COMPANY_NAME}" width="260" height="68" />` : ''}
      </td>
      <td valign="middle">
        <p style="margin:0;font-size:22pt;font-weight:bold;color:${NAVY};letter-spacing:0.4px;">${COMPANY_NAME}</p>
        <p style="margin:6px 0 0;font-size:13pt;color:#475569;">${escapeHtml(opts.documentTitle)}</p>
      </td>
      <td valign="middle" align="right" style="white-space:nowrap;">
        <p style="margin:0;font-size:9pt;color:#64748b;">Generated ${escapeHtml(formatWhen())}</p>
        <p style="margin:4px 0 0;font-size:9pt;color:#64748b;">${opts.cells.length} record${opts.cells.length === 1 ? '' : 's'}</p>
      </td>
    </tr>
  </table>
  <div style="height:4px;background:${LIME};margin:8px 0 16px;"></div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p style="margin-top:18px;font-size:8pt;color:#94a3b8;">Confidential — ${COMPANY_NAME} internal use</p>
</body>
</html>`.trim();

  triggerDownload(new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }), opts.filename);
}

export async function exportBrandedTable(opts: {
  format: ExportFormat;
  documentTitle: string;
  filenameStem: string;
  headers: string[];
  rows: string[][];
}) {
  const filename = `${opts.filenameStem}-${slugDate()}.${opts.format === 'pdf' ? 'pdf' : 'doc'}`;
  if (opts.format === 'pdf') {
    await exportPdf({ filename, documentTitle: opts.documentTitle, headers: opts.headers, cells: opts.rows });
    return;
  }
  await exportWord({ filename, documentTitle: opts.documentTitle, headers: opts.headers, cells: opts.rows });
}

export async function exportServiceRequests(
  rows: ServiceRequestExportRow[],
  format: ExportFormat,
  documentTitle = 'Client Service Requests',
) {
  if (rows.length === 0) {
    throw new Error('There are no service requests to export.');
  }
  await exportBrandedTable({
    format,
    documentTitle,
    filenameStem: `Alphateknexus-client-service-requests`,
    headers: TABLE_HEADERS,
    rows: rowsToCells(rows),
  });
}
