import logoUrl from '../assets/alphateknexus_logo.png';
import {
  amountInWords,
  COMPANY,
  COMPANY_SIGNATORY,
  formatLe,
} from './companyDocs';
import type { PaymentMethod, PayslipLine } from '../admin/hr/payslip';
import { PAYMENT_METHOD_LABEL, periodLabel } from '../admin/hr/payslip';

export interface PayslipPdfInput {
  periodYear: number;
  periodMonth: number;
  employeeNumber: string;
  employeeName: string;
  division: string;
  role: string;
  currency: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  paymentMethod: PaymentMethod;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  notes: string | null;
  issuedAt?: string | null;
}

let cachedLogo: string | null | undefined;

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

function moneyCells(lines: PayslipLine[]): string[][] {
  return lines
    .filter((l) => l.label.trim())
    .map((l) => [l.label.trim(), formatLe(l.amount)]);
}

export async function buildPayslipPdfBlob(input: PayslipPdfInput): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();
  const period = periodLabel(input.periodYear, input.periodMonth);

  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 14, 10, 48, 14);
    } catch {
      /* logo optional */
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 58, 138);
  doc.text('PAYSLIP', pageWidth - 14, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(period, pageWidth - 14, 22, { align: 'right' });

  const companyX = logo ? 66 : 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(COMPANY.legalName, companyX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`${COMPANY.street} ${COMPANY.city}`, companyX, 19);
  doc.text(`Tel ${COMPANY.phones}  ·  TIN ${COMPANY.tin}`, companyX, 23);

  doc.setDrawColor(101, 163, 13);
  doc.setLineWidth(0.8);
  doc.line(14, 28, pageWidth - 14, 28);

  const meta: [string, string][] = [
    ['Employee', input.employeeName],
    ['Employee no.', input.employeeNumber],
    ['Division', input.division || '—'],
    ['Role', input.role || '—'],
    ['Payment', PAYMENT_METHOD_LABEL[input.paymentMethod] || input.paymentMethod],
  ];
  if (input.bankName || input.accountNumber) {
    const acct = [input.bankName, input.accountName, input.accountNumber].filter(Boolean).join(' · ');
    meta.push(['Bank', acct]);
  }
  if (input.issuedAt) {
    meta.push(['Issued', new Date(input.issuedAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })]);
  }

  let y = 34;
  meta.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(k.toUpperCase(), 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(v, 48, y);
    y += 5;
  });

  const earningsBody = moneyCells(input.earnings);
  autoTable(doc, {
    startY: y + 2,
    head: [['Earnings', 'Amount']],
    body: earningsBody.length ? earningsBody : [['—', formatLe(0)]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, textColor: [15, 23, 42] },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    foot: [['Gross pay', formatLe(input.grossPay)]],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  const afterEarnings = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const deductionBody = moneyCells(input.deductions);
  autoTable(doc, {
    startY: afterEarnings,
    head: [['Deductions', 'Amount']],
    body: deductionBody.length ? deductionBody : [['—', formatLe(0)]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, textColor: [15, 23, 42] },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    foot: [['Total deductions', formatLe(input.totalDeductions)]],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  const afterDeductions = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFillColor(236, 253, 245);
  doc.roundedRect(14, afterDeductions, pageWidth - 28, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 95, 70);
  doc.text('NET PAY', 18, afterDeductions + 6);
  doc.setFontSize(13);
  doc.text(formatLe(input.netPay), pageWidth - 18, afterDeductions + 10, { align: 'right' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const words = amountInWords(input.netPay);
  const wordLines = doc.splitTextToSize(`Amount in words: ${words}`, pageWidth - 28);
  doc.text(wordLines, 14, afterDeductions + 22);

  let notesY = afterDeductions + 22 + wordLines.length * 4 + 4;
  if (input.notes?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(`Notes: ${input.notes.trim()}`, pageWidth - 28);
    doc.text(noteLines, 14, notesY);
    notesY += noteLines.length * 4 + 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(COMPANY_SIGNATORY.name, 14, notesY + 10);
  doc.setTextColor(100, 116, 139);
  doc.text(COMPANY_SIGNATORY.title, 14, notesY + 14);

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Confidential — for the named employee only  ·  ${COMPANY.legalName}  ·  ${period}`,
    pageWidth / 2,
    pageHeight - 9,
    { align: 'center' },
  );

  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
