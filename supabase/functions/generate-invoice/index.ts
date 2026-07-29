import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  line_items: LineItem[];
  created_by: string;
  paid_at: string | null;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { action, invoiceId, recipientEmail } = body;

    if (action === 'generate-pdf') {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();
      if (error || !invoice) {
        return new Response(JSON.stringify({ error: 'Invoice not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', invoice.user_id)
        .maybeSingle();

      const html = buildInvoiceHTML(invoice as Invoice, profile);
      return new Response(JSON.stringify({ html, invoiceNumber: invoice.invoice_number }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'send-email') {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();
      if (error || !invoice) {
        return new Response(JSON.stringify({ error: 'Invoice not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', invoice.user_id)
        .maybeSingle();

      const email = recipientEmail || profile?.email;
      if (!email) {
        return new Response(JSON.stringify({ error: 'No recipient email found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const html = buildInvoiceHTML(invoice as Invoice, profile);

      // Insert in-app notification (always — works even if email fails)
      await supabase.from('notifications').insert({
        user_id: invoice.user_id,
        title: `Invoice ${invoice.invoice_number}`,
        body: `You have a new invoice for ${invoice.currency} ${Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Due ${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
        type: 'invoice',
        read: false,
        service_slug: 'finance',
      });

      // Send real email via Resend if configured
      let emailSent = false;
      let emailError: string | null = null;
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        try {
          const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'AlphaTek Nexus <noreply@alphateknexus.com>',
              to: [email],
              subject: `Invoice ${invoice.invoice_number} from AlphaTek Nexus`,
              html,
            }),
          });
          if (resendRes.ok) {
            emailSent = true;
          } else {
            emailError = await resendRes.text();
            console.error('Resend API error:', emailError);
          }
        } catch (err) {
          emailError = err.message;
          console.error('Email send error:', err.message);
        }
      }

      // Log the email attempt
      await supabase.from('email_log').insert({
        user_id: invoice.user_id,
        recipient_email: email,
        event_type: 'invoice_issued',
        subject: `Invoice ${invoice.invoice_number} from AlphaTek Nexus`,
        status: emailSent ? 'sent' : 'failed',
        reference_id: invoiceId,
        error_message: emailError,
      });

      // Mark as sent
      await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoiceId);

      return new Response(JSON.stringify({
        success: true,
        message: emailSent ? `Invoice emailed to ${email}` : `Invoice notification sent to ${email} (email delivery pending)`,
        emailSent,
        notificationSent: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildInvoiceHTML(inv: Invoice, profile: any): string {
  const lineItemsHtml = (inv.line_items || []).map((item, i) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#475569;">${i + 1}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:500;">${item.description}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;color:#475569;">${item.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;color:#475569;">${inv.currency} ${Number(item.unit_price).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:right;color:#1e293b;font-weight:600;">${inv.currency} ${Number(item.total).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
    </tr>`).join('');

  const statusColor = inv.status === 'paid' ? '#059669' : inv.status === 'overdue' ? '#dc2626' : inv.status === 'sent' ? '#2563eb' : '#64748b';
  const issueDate = new Date(inv.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const dueDate = new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const balance = Number(inv.total) - Number(inv.amount_paid);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${inv.invoice_number}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:32px}
  .inv{max-width:720px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .hdr{background:linear-gradient(135deg,#0f172a,#1e293b);padding:40px 48px;color:#fff}
  .hdr h1{margin:0;font-size:28px;font-weight:800}
  .hdr p{margin:6px 0 0;color:#94a3b8;font-size:14px}
  .badge{display:inline-block;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:32px 48px 0}
  .grid h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:600}
  .grid p{margin:0;color:#1e293b;font-size:14px;line-height:1.6}
  .tbl{padding:24px 48px 0}
  .tbl table{width:100%;border-collapse:collapse}
  .tbl th{padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:600;background:#f8fafc;border-bottom:2px solid #e2e8f0}
  .totals{padding:24px 48px;display:flex;justify-content:flex-end}
  .totals table{width:280px;border-collapse:collapse}
  .totals td{padding:10px 16px;font-size:14px;color:#475569}
  .totals .grand{border-top:2px solid #0f172a;padding-top:14px;margin-top:6px}
  .totals .grand td{font-size:20px;font-weight:800;color:#0f172a}
  .ftr{padding:24px 48px 40px;border-top:1px solid #e2e8f0;margin-top:16px}
  .ftr p{margin:0;color:#94a3b8;font-size:12px;line-height:1.6}
  @media print{body{padding:0;background:#fff}.inv{box-shadow:none;border-radius:0}}
</style></head><body>
<div class="inv">
  <div class="hdr">
    <h1>AlphaTek Nexus</h1>
    <p>Professional Services Invoice</p>
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;color:#cbd5e1">Invoice ${inv.invoice_number}</span>
      <span class="badge">${inv.status}</span>
    </div>
  </div>
  <div class="grid">
    <div>
      <h3>Bill To</h3>
      <p><strong>${profile?.full_name || 'Client'}</strong><br>${profile?.email || ''}<br>${profile?.phone || ''}</p>
    </div>
    <div>
      <h3>Invoice Details</h3>
      <p><strong>Issue Date:</strong> ${issueDate}<br><strong>Due Date:</strong> ${dueDate}<br><strong>Currency:</strong> ${inv.currency}</p>
    </div>
  </div>
  <div class="tbl">
    <table>
      <thead><tr>
        <th style="width:40px">#</th><th>Description</th><th style="text-align:center;width:80px">Qty</th>
        <th style="text-align:right;width:120px">Unit Price</th><th style="text-align:right;width:120px">Total</th>
      </tr></thead>
      <tbody>${lineItemsHtml}</tbody>
    </table>
  </div>
  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td style="text-align:right;font-weight:600">${inv.currency} ${Number(inv.subtotal).toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
      <tr><td>Tax (${inv.tax_rate}%)</td><td style="text-align:right;font-weight:600">${inv.currency} ${Number(inv.tax_amount).toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
      <tr class="grand"><td>Total</td><td style="text-align:right">${inv.currency} ${Number(inv.total).toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
      <tr><td>Amount Paid</td><td style="text-align:right;color:#059669">${inv.currency} ${Number(inv.amount_paid).toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
      <tr class="grand"><td>Balance Due</td><td style="text-align:right;color:${balance > 0 ? '#dc2626' : '#059669'}">${inv.currency} ${balance.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
    </table>
  </div>
  ${inv.notes ? `<div style="padding:0 48px 24px"><div style="background:#f8fafc;border-radius:12px;padding:16px 20px;border:1px solid #e2e8f0"><strong style="font-size:12px;color:#64748b">Notes:</strong><p style="margin:8px 0 0;font-size:13px;color:#475569">${inv.notes}</p></div></div>` : ''}
  <div class="ftr">
    <p>Thank you for your business. Payment is due by ${dueDate}.<br>AlphaTek Nexus — Professional Services for Cleaning, Clearing & Forwarding, Private Security, Procurement, and Smart Sort.</p>
  </div>
</div>
</body></html>`;
}
