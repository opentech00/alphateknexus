import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { classifyCheckoutEvent, extractAmountMinor, extractCaphEvent, verifyMonimeSignature } from "../_shared/monime.ts";
import { completeMonimePayment, recordMonimeFailure, resolveUnmatchedFor } from "../_shared/monimeFulfill.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.text();
    const signature = req.headers.get("X-Monime-Signature") || req.headers.get("Monime-Signature") || "";
    const webhookSecret = Deno.env.get("MONIME_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("MONIME_WEBHOOK_SECRET is not configured — rejecting webhook");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valid = await verifyMonimeSignature(payload, signature, webhookSecret);
    if (!valid) {
      console.error("Webhook signature verification failed");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(payload);
    const parsed = extractCaphEvent(event);
    const kind = classifyCheckoutEvent(parsed.eventName, parsed.status);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (parsed.eventId) {
      const { data: byEvent } = await supabase
        .from("monime_payments")
        .select("id")
        .eq("webhook_event_id", parsed.eventId)
        .maybeSingle();
      if (byEvent) {
        return new Response(JSON.stringify({ received: true, already: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let monimePayment: any = null;

    if (parsed.sessionId) {
      const { data } = await supabase
        .from("monime_payments")
        .select("*")
        .eq("checkout_session_id", parsed.sessionId)
        .maybeSingle();
      monimePayment = data;
    }
    if (!monimePayment && parsed.reference) {
      const { data } = await supabase
        .from("monime_payments")
        .select("*")
        .eq("reference", parsed.reference)
        .maybeSingle();
      monimePayment = data;
    }
    if (!monimePayment && parsed.relatedId) {
      const { data } = await supabase
        .from("monime_payments")
        .select("*")
        .eq("related_id", parsed.relatedId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      monimePayment = data;
    }

    if (!monimePayment) {
      console.error("Unmatched Monime webhook", {
        eventId: parsed.eventId,
        eventName: parsed.eventName,
        sessionId: parsed.sessionId,
        reference: parsed.reference,
        relatedId: parsed.relatedId,
      });
      const amountMinor = extractAmountMinor(parsed.data);
      const row = {
        event_id: parsed.eventId || null,
        event_name: parsed.eventName,
        outcome: kind,
        session_id: parsed.sessionId || null,
        reference: parsed.reference || null,
        related_id: parsed.relatedId || null,
        amount_minor: amountMinor,
        payload: event,
      };
      const { error: inboxErr } = parsed.eventId
        ? await supabase.from("monime_webhook_unmatched").upsert(row, { onConflict: "event_id", ignoreDuplicates: true })
        : await supabase.from("monime_webhook_unmatched").insert(row);
      if (inboxErr) console.error("Failed to store unmatched webhook:", inboxErr.message);

      if (kind === "completed") {
        const amountLabel = amountMinor ? `SLE ${(amountMinor / 100).toFixed(2)}` : "A payment";
        const { error: notifyErr } = await supabase.rpc("enqueue_admin_notification", {
          p_event_type: "monime_unmatched_payment",
          p_title: "Unmatched Monime payment",
          p_body: `${amountLabel} completed in Monime (${parsed.reference || parsed.sessionId || "no reference"}) but matches no local payment. Review it in Finance → Mobile Money.`,
          p_category: "payments",
          p_metadata: { session_id: parsed.sessionId, reference: parsed.reference, event_id: parsed.eventId },
        });
        if (notifyErr) console.error("Failed to notify admins:", notifyErr.message);
      }

      return new Response(JSON.stringify({ received: true, unmatched: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "completed") {
      const result = await completeMonimePayment(supabase, monimePayment, {
        recordedBy: "monime_webhook",
        paymentId: parsed.paymentId,
        payload: event,
        webhookEventId: parsed.eventId || null,
        providerId: parsed.providerId,
        channel: parsed.channel,
      });
      return new Response(JSON.stringify({ received: true, already: result.already }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "failed" || kind === "cancelled") {
      const extras: Record<string, unknown> = {};
      if (parsed.eventId) extras.webhook_event_id = parsed.eventId;
      if (parsed.providerId) extras.provider_id = parsed.providerId;
      if (parsed.channel) extras.channel = parsed.channel;
      await recordMonimeFailure(supabase, monimePayment, kind, event, extras);
      await resolveUnmatchedFor(supabase, monimePayment);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
