import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { refreshMonimeSession } from "../_shared/monimeFulfill.ts";
import {
  assertOnlineAmount,
  bookingTotalSle,
  CheckoutError,
  createCheckoutSession,
  planBookingAmount,
} from "../_shared/monimeCheckout.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function summarize(booking: any) {
  const total = bookingTotalSle(booking.details);
  const paid = Number(booking.amount_paid_sle || 0);
  const settled = ["paid", "verified"].includes(booking.payment_status || "");
  return {
    total,
    paid,
    due: settled || total === null ? 0 : Math.max(0, Math.round((total - paid) * 100) / 100),
    payment_status: booking.payment_status,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { booking_id, action = "summary", reference, app_origin } = await req.json();
    if (!booking_id) return json({ error: "Missing booking_id" }, 400);
    const appOrigin = app_origin || req.headers.get("Origin") || "https://alphateknexus.app";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const isAdmin = profile?.role === "admin";

    if (!isAdmin) {
      const { data: employees } = await supabase.from("employees").select("id").eq("user_id", user.id);
      const employeeIds = (employees || []).map((e: { id: string }) => e.id);
      if (!employeeIds.length) return json({ error: "Only assigned crew can collect payment." }, 403);
      const { data: assignment } = await supabase
        .from("field_assignments")
        .select("id")
        .eq("booking_id", booking_id)
        .in("employee_id", employeeIds)
        .not("status", "in", "(declined,rejected)")
        .limit(1)
        .maybeSingle();
      if (!assignment) return json({ error: "You are not assigned to this job." }, 403);
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, status, deleted_at, details, amount_paid_sle, payment_status")
      .eq("id", booking_id)
      .maybeSingle();
    if (!booking) return json({ error: "Booking not found" }, 404);

    if (action === "status") {
      if (!reference) return json({ error: "Missing reference" }, 400);
      const { data: row } = await supabase
        .from("monime_payments")
        .select("*")
        .eq("reference", reference)
        .eq("related_id", booking_id)
        .maybeSingle();
      if (!row || (!isAdmin && row.initiated_by !== user.id)) return json({ error: "Payment not found" }, 404);
      const refreshed = await refreshMonimeSession(supabase, row, "monime_field");
      const { data: fresh } = await supabase
        .from("bookings")
        .select("details, amount_paid_sle, payment_status")
        .eq("id", booking_id)
        .maybeSingle();
      return json({ status: refreshed.status, reference, ...summarize(fresh || booking) });
    }

    if (action === "summary") {
      const { data: pending } = await supabase
        .from("monime_payments")
        .select("reference, checkout_url, amount_sle, created_at")
        .eq("related_id", booking_id)
        .eq("kind", "field")
        .eq("status", "pending")
        .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ ...summarize(booking), pending });
    }

    if (action !== "create") return json({ error: "Invalid action" }, 400);

    if (!booking.user_id) return json({ error: "This booking has no client account to credit." }, 400);
    if (booking.status === "cancelled" || booking.deleted_at) {
      return json({ error: "This booking cannot be paid." }, 400);
    }

    const plan = planBookingAmount(booking, "full", true);
    assertOnlineAmount(plan.amountSle, "booking");

    const session = await createCheckoutSession(supabase, {
      ownerId: booking.user_id,
      purpose: "booking",
      relatedId: booking.id,
      amountSle: plan.amountSle,
      kind: "field",
      initiatedBy: user.id,
      appOrigin,
      returnPage: "field-paid",
      referenceBase: `FLD-${booking.id.slice(0, 8).toUpperCase()}`,
      label: "On-site payment",
    });

    return json({
      checkoutUrl: session.checkoutUrl,
      reference: session.reference,
      amount: session.amountSle,
      reused: session.reused,
      ...summarize(booking),
    });
  } catch (err) {
    if (err instanceof CheckoutError) return json({ error: err.message, ...err.extra }, err.status);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
