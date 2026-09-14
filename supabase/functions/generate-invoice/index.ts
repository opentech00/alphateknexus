import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildOfficialInvoiceHtml, parseInvoiceNotes } from '../_shared/companyDocs.ts';

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

    // ── Authorization: internal (service role) callers, or a signed-in user ──
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    let callerId: string | null = null;
    let callerIsPrivileged = token.length > 0 && serviceKey.length > 0 && token === serviceKey;

    if (!callerIsPrivileged) {
      if (token.length === 0) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: authData } = await supabase.auth.getUser(token);
      if (!authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      callerId = authData.user.id;
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', callerId)
        .maybeSingle();
      callerIsPrivileged = callerProfile?.role === 'admin';
    }

    const body = await req.json();
    const { action, invoiceId } = body;

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
      if (!callerIsPrivileged && invoice.user_id !== callerId) {
        return new Response(JSON.stringify({ error: 'Invoice not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone, address')
        .eq('id', invoice.user_id)
        .maybeSingle();

      const html = officialInvoiceHtml(invoice as Invoice, profile);
      return new Response(JSON.stringify({ html, invoiceNumber: invoice.invoice_number }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'send-email') {
      if (!callerIsPrivileged) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
        .select('full_name, email, phone, address')
        .eq('id', invoice.user_id)
        .maybeSingle();

      const email = profile?.email;
      if (!email) {
        return new Response(JSON.stringify({ error: 'No recipient email found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const html = officialInvoiceHtml(invoice as Invoice, profile);

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
              from: 'Alphatek Global SL Limited <noreply@alphateknexus.com>',
              to: [email],
              subject: `Invoice ${invoice.invoice_number} from Alphatek Global SL Limited`,
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
        subject: `Invoice ${invoice.invoice_number} from Alphatek Global SL Limited`,
        status: emailSent ? 'sent' : 'failed',
        reference_id: invoiceId,
        error_message: emailError,
      });

      // Mark draft invoices as sent; keep overdue/paid/cancelled as-is
      if (invoice.status === 'draft') {
        await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoiceId);
      }

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
    console.error('Invoice error:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: 'Invoice request failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function officialInvoiceHtml(inv: Invoice, profile: any): string {
  const parsed = parseInvoiceNotes(inv.notes);
  return buildOfficialInvoiceHtml({
    invoiceNumber: inv.invoice_number,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    currency: inv.currency,
    subtotal: Number(inv.subtotal),
    discountRate: Number(inv.tax_rate),
    discountAmount: Number(inv.tax_amount),
    total: Number(inv.total),
    amountPaid: Number(inv.amount_paid),
    notes: inv.notes,
    lineItems: inv.line_items || [],
    billToName: parsed.billToName || profile?.full_name || 'Client',
    billToAddress: parsed.billToAddress || profile?.address,
    billToEmail: profile?.email,
    billToPhone: profile?.phone,
  });
}

