import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { toMonimePhone } from "../_shared/phone.ts";
import {
  assertOnlineAmount,
  CheckoutError,
  createCheckoutSession,
  planBookingAmount,
  type PaymentKind,
} from "../_shared/monimeCheckout.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { amount, purpose, related_id, reference, app_origin, mode } = await req.json();
    const appOrigin = app_origin || req.headers.get("Origin") || "https://alphateknexus.app";

    if (!["invoice", "wallet_topup", "booking"].includes(purpose)) {
      return json({ error: "Invalid purpose" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth header" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    let amountSle: number;
    let kind: PaymentKind = "full";
    let relatedId: string | null = null;
    let label = "Wallet top-up";
    let summary: Record<string, unknown> = {};

    if (purpose === "wallet_topup") {
      amountSle = round2(Number(amount));
    } else if (purpose === "booking") {
      if (!related_id) return json({ error: "Booking id is required" }, 400);
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, user_id, status, deleted_at, details, amount_paid_sle, payment_status")
        .eq("id", related_id)
        .maybeSingle();
      if (!booking) return json({ error: "Booking not found" }, 404);
      if (booking.user_id !== user.id) return json({ error: "You do not own this booking" }, 403);
      if (booking.status === "cancelled" || booking.deleted_at) {
        return json({ error: "This booking cannot be paid." }, 400);
      }
      const plan = planBookingAmount(booking, mode === "deposit" ? "deposit" : "full");
      amountSle = plan.amountSle;
      kind = plan.kind;
      relatedId = booking.id;
      label = kind === "deposit" ? "Booking deposit" : kind === "balance" ? "Booking balance" : "Booking payment";
      summary = { total: plan.totalSle, paid: plan.paidSle, due: plan.dueSle, deposit: plan.depositSle };
    } else {
      if (!related_id) return json({ error: "Invoice id is required" }, 400);
      const { data: financeInv } = await supabase
        .from("invoices")
        .select("id, user_id, status, total, amount_paid")
        .eq("id", related_id)
        .maybeSingle();
      const { data: smartInv } = financeInv
        ? { data: null }
        : await supabase
          .from("smart_sort_invoices")
          .select("id, user_id, status, amount_sle, amount_paid_sle")
          .eq("id", related_id)
          .maybeSingle();
      const invoice = financeInv || smartInv;
      if (!invoice) return json({ error: "Invoice not found" }, 404);
      if (invoice.user_id !== user.id) return json({ error: "You do not own this invoice" }, 403);
      if (["draft", "cancelled", "void", "paid"].includes(invoice.status)) {
        return json({ error: "This invoice cannot be paid online." }, 400);
      }
      const total = Number(financeInv ? financeInv.total : smartInv?.amount_sle) || 0;
      const paid = Number(financeInv ? financeInv.amount_paid : smartInv?.amount_paid_sle) || 0;
      amountSle = round2(Math.max(0, total - paid));
      if (amountSle <= 0) return json({ error: "This invoice is already paid." }, 400);
      kind = paid > 0 ? "balance" : "full";
      relatedId = invoice.id;
      label = "Invoice payment";
      summary = { total, paid, due: amountSle };
    }

    assertOnlineAmount(amountSle, purpose);

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_e164, phone")
      .eq("id", user.id)
      .maybeSingle();

    const session = await createCheckoutSession(supabase, {
      ownerId: user.id,
      purpose,
      relatedId,
      amountSle,
      kind,
      appOrigin,
      returnPage: "payment-return",
      referenceBase: typeof reference === "string" && reference.trim() ? reference.trim() : null,
      customerPhone: toMonimePhone(profile?.phone_e164 || profile?.phone || ""),
      label,
    });

    return json({
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      reference: session.reference,
      amount: session.amountSle,
      kind: session.kind,
      reused: session.reused,
      ...summary,
    });
  } catch (err) {
    if (err instanceof CheckoutError) return json({ error: err.message, ...err.extra }, err.status);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
