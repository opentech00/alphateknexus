import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function fmtMoney(n: number, currency = "SLE") {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authorization: internal (service role) callers, or a signed-in admin ──
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let authorized = token.length > 0 && serviceKey.length > 0 && token === serviceKey;

    if (!authorized) {
      if (token.length === 0) return json({ error: "Unauthorized" }, 401);
      const { data: authData } = await supabase.auth.getUser(token);
      if (!authData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      authorized = callerProfile?.role === "admin";
      if (!authorized) return json({ error: "Forbidden" }, 403);
    }

    const { action, reportType, userId, periodStart, periodEnd, sendEmail } = await req.json();

    if (!action) {
      return json({ error: "Missing action" }, 400);
    }

    // ── Generate a report ──
    if (action === "generate") {
      if (!reportType) {
        return new Response(JSON.stringify({ error: "Missing reportType" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const end = periodEnd || new Date().toISOString().split("T")[0];
      const start = periodStart || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

      let summary: Record<string, any> = { period_start: start, period_end: end };

      if (reportType === "admin_revenue" || reportType === "weekly_digest") {
        // Aggregate revenue data
        const { data: walletTxns } = await supabase
          .from("wallet_transactions")
          .select("type, amount_sle, status, created_at")
          .gte("created_at", start)
          .lte("created_at", end + "T23:59:59")
          .eq("status", "completed");

        const { data: invoices } = await supabase
          .from("invoices")
          .select("status, total, amount_paid, currency, created_at")
          .gte("created_at", start)
          .lte("created_at", end + "T23:59:59");

        const { data: withdrawals } = await supabase
          .from("withdrawal_requests")
          .select("status, amount_sle, created_at")
          .gte("created_at", start)
          .lte("created_at", end + "T23:59:59");

        const txns = walletTxns || [];
        const invs = invoices || [];
        const wds = withdrawals || [];

        const totalInflow = txns.filter((t: any) => Number(t.amount_sle) > 0).reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
        const totalOutflow = txns.filter((t: any) => Number(t.amount_sle) < 0).reduce((s: number, t: any) => s + Math.abs(Number(t.amount_sle)), 0);
        const totalInvoiced = invs.reduce((s: number, i: any) => s + Number(i.total), 0);
        const totalCollected = invs.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + Number(i.amount_paid), 0);
        const outstanding = invs.filter((i: any) => i.status === "sent" || i.status === "overdue").reduce((s: number, i: any) => s + (Number(i.total) - Number(i.amount_paid)), 0);
        const pendingWithdrawals = wds.filter((w: any) => w.status === "pending").reduce((s: number, w: any) => s + Number(w.amount_sle), 0);
        const completedWithdrawals = wds.filter((w: any) => w.status === "completed").reduce((s: number, w: any) => s + Number(w.amount_sle), 0);

        summary = {
          period_start: start,
          period_end: end,
          total_inflow: totalInflow,
          total_outflow: totalOutflow,
          net_flow: totalInflow - totalOutflow,
          total_invoiced: totalInvoiced,
          total_collected: totalCollected,
          outstanding_invoices: outstanding,
          pending_withdrawals: pendingWithdrawals,
          completed_withdrawals: completedWithdrawals,
          invoice_count: invs.length,
          withdrawal_count: wds.length,
          transaction_count: txns.length,
        };
      } else if (reportType === "client_statement") {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Missing userId for client_statement" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .maybeSingle();

        const { data: txns } = await supabase
          .from("wallet_transactions")
          .select("type, amount_sle, balance_after, description, method, reference, status, created_at")
          .eq("user_id", userId)
          .gte("created_at", start)
          .lte("created_at", end + "T23:59:59")
          .order("created_at", { ascending: true });

        const { data: invs } = await supabase
          .from("invoices")
          .select("invoice_number, status, total, amount_paid, currency, issue_date, due_date")
          .eq("user_id", userId)
          .gte("created_at", start)
          .lte("created_at", end + "T23:59:59")
          .order("created_at", { ascending: true });

        const { data: wds } = await supabase
          .from("withdrawal_requests")
          .select("amount_sle, payout_method, status, created_at, completed_at")
          .eq("user_id", userId)
          .gte("created_at", start)
          .lte("created_at", end + "T23:59:59")
          .order("created_at", { ascending: true });

        const allTxns = txns || [];
        const balance = allTxns.length > 0 ? Number(allTxns[allTxns.length - 1].balance_after) : 0;
        const totalSpent = allTxns.filter((t: any) => Number(t.amount_sle) < 0).reduce((s: number, t: any) => s + Math.abs(Number(t.amount_sle)), 0);
        const totalToppedUp = allTxns.filter((t: any) => Number(t.amount_sle) > 0).reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
        const invoicesPaid = (invs || []).filter((i: any) => i.status === "paid").length;
        const invoicesOutstanding = (invs || []).filter((i: any) => i.status === "sent" || i.status === "overdue").length;

        summary = {
          period_start: start,
          period_end: end,
          client_name: profile?.full_name || "Unknown",
          client_email: profile?.email || "",
          wallet_balance: balance,
          total_spent: totalSpent,
          total_topped_up: totalToppedUp,
          transaction_count: allTxns.length,
          invoices_paid: invoicesPaid,
          invoices_outstanding: invoicesOutstanding,
          transactions: allTxns,
          invoices: invs || [],
          withdrawals: wds || [],
        };
      }

      // Save the report
      const { data: report, error: reportErr } = await supabase
        .from("finance_reports")
        .insert({
          user_id: userId || null,
          report_type: reportType,
          period_start: start,
          period_end: end,
          summary,
          status: "generated",
        })
        .select()
        .single();

      if (reportErr) {
        console.error("Finance report insert error:", reportErr.message);
        return json({ error: "Could not save the report" }, 500);
      }

      // Optionally email the report
      if (sendEmail && userId) {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        const recipientEmail = userData?.user?.email;
        if (recipientEmail) {
          const resendKey = Deno.env.get("RESEND_API_KEY");
          if (resendKey) {
            const emailHtml = buildReportEmail(summary, reportType);
            try {
              const resendRes = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: "AlphaTek Nexus <noreply@alphateknexus.com>",
                  to: [recipientEmail],
                  subject: reportType === "client_statement"
                    ? `Your Financial Statement (${formatDate(start)} - ${formatDate(end)})`
                    : `Weekly Finance Digest (${formatDate(start)} - ${formatDate(end)})`,
                  html: emailHtml,
                }),
              });
              if (resendRes.ok) {
                await supabase.from("finance_reports").update({ status: "emailed" }).eq("id", report.id);
                await supabase.from("email_log").insert({
                  user_id: userId,
                  recipient_email: recipientEmail,
                  event_type: "finance_report",
                  subject: `Financial Report ${formatDate(start)} - ${formatDate(end)}`,
                  status: "sent",
                  reference_id: report.id,
                });
              }
            } catch (err) {
              console.error("Report email error:", err.message);
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true, report }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── List reports ──
    if (action === "list") {
      const query = supabase.from("finance_reports").select("*").order("created_at", { ascending: false }).limit(50);
      if (userId) query.eq("user_id", userId);
      const { data, error } = await query;
      if (error) {
        console.error("Finance report list error:", error.message);
        return json({ error: "Could not load reports" }, 500);
      }
      return new Response(JSON.stringify({ reports: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Finance report error:", err instanceof Error ? err.message : err);
    return json({ error: "Report generation failed" }, 500);
  }
});

function buildReportEmail(summary: Record<string, any>, reportType: string): string {
  const isClient = reportType === "client_statement";
  const title = isClient ? "Your Financial Statement" : "Weekly Finance Digest";
  const period = `${formatDate(summary.period_start)} – ${formatDate(summary.period_end)}`;

  let detailsHtml = "";
  if (isClient) {
    detailsHtml = `
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Wallet Balance</span><span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${fmtMoney(summary.wallet_balance || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Total Topped Up</span><span style="float:right;color:#059669;font-size:13px;font-weight:600;">${fmtMoney(summary.total_topped_up || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Total Spent</span><span style="float:right;color:#dc2626;font-size:13px;font-weight:600;">${fmtMoney(summary.total_spent || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Transactions</span><span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${summary.transaction_count || 0}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Invoices Paid</span><span style="float:right;color:#059669;font-size:13px;font-weight:600;">${summary.invoices_paid || 0}</span></td></tr>
      <tr><td style="padding:14px 20px;"><span style="color:#64748b;font-size:13px;">Invoices Outstanding</span><span style="float:right;color:#dc2626;font-size:13px;font-weight:600;">${summary.invoices_outstanding || 0}</span></td></tr>`;
  } else {
    detailsHtml = `
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Total Inflow</span><span style="float:right;color:#059669;font-size:13px;font-weight:600;">${fmtMoney(summary.total_inflow || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Total Outflow</span><span style="float:right;color:#dc2626;font-size:13px;font-weight:600;">${fmtMoney(summary.total_outflow || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Net Cash Flow</span><span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${fmtMoney(summary.net_flow || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Total Invoiced</span><span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${fmtMoney(summary.total_invoiced || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Total Collected</span><span style="float:right;color:#059669;font-size:13px;font-weight:600;">${fmtMoney(summary.total_collected || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Outstanding Invoices</span><span style="float:right;color:#dc2626;font-size:13px;font-weight:600;">${fmtMoney(summary.outstanding_invoices || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">Pending Withdrawals</span><span style="float:right;color:#f59e0b;font-size:13px;font-weight:600;">${fmtMoney(summary.pending_withdrawals || 0)}</span></td></tr>
      <tr><td style="padding:14px 20px;"><span style="color:#64748b;font-size:13px;">Completed Withdrawals</span><span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${fmtMoney(summary.completed_withdrawals || 0)}</span></td></tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">AlphaTek Nexus</h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${title}</p>
        </td></tr>
        <tr><td style="padding:24px 40px 0;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:14px;">Reporting Period</p>
          <p style="margin:4px 0 0;color:#0f172a;font-size:16px;font-weight:600;">${period}</p>
        </td></tr>
        <tr><td style="padding:24px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
            ${detailsHtml}
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 32px;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
            This is an automated financial report from AlphaTek Nexus.<br/>
            Log in to your account for full transaction details.
          </p>
          <p style="margin:16px 0 0;color:#cbd5e1;font-size:11px;">© AlphaTek Nexus. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
