import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { amount, purpose, related_id, reference, app_origin } = await req.json();

    const appOrigin = app_origin || req.headers.get("Origin") || "https://alphateknexus.app";

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (amount < 5) {
      return new Response(JSON.stringify({ error: "Minimum top-up is SLE 5.00" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (amount > 10000) {
      return new Response(JSON.stringify({ error: "Maximum top-up is SLE 10,000.00" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!purpose || !["invoice", "wallet_topup", "subscription", "booking"].includes(purpose)) {
      return new Response(JSON.stringify({ error: "Invalid purpose" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate ownership of related_id for invoice payments
    if (purpose === "invoice" && related_id) {
      const { data: invoice, error: invErr } = await supabase
        .from("smart_sort_invoices")
        .select("id, user_id")
        .eq("id", related_id)
        .maybeSingle();

      if (invErr || !invoice) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (invoice.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "You do not own this invoice" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const monimeKey = Deno.env.get("MONIME_ACCESS_KEY");
    const spaceId = Deno.env.get("MONIME_SPACE_ID");

    if (!monimeKey || !spaceId) {
      return new Response(JSON.stringify({ error: "Monime not configured. Set MONIME_ACCESS_KEY and MONIME_SPACE_ID secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idempotencyKey = crypto.randomUUID();
    const finalRef = reference || `ATN-${purpose.toUpperCase()}-${Date.now()}`;

    const monimeRes = await fetch("https://api.monime.io/v1/checkout-sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${monimeKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "Monime-Space-Id": spaceId,
      },
      body: JSON.stringify({
        name: "Alphatek Nexus Payment",
        description: finalRef,
        lineItems: [{
          name: finalRef,
          price: { currency: "SLE", value: Math.round(amount * 100) },
          type: "custom",
          quantity: 1,
          reference: finalRef,
          description: `${purpose} payment`,
        }],
        successUrl: `${appOrigin}/?payment=success&ref=${finalRef}`,
        cancelUrl: `${appOrigin}/?payment=cancel&ref=${finalRef}`,
        reference: finalRef,
        metadata: {
          user_id: user.id,
          purpose,
          related_id: related_id || "",
        },
      }),
    });

    if (!monimeRes.ok) {
      const errText = await monimeRes.text();
      return new Response(JSON.stringify({ error: `Monime API error: ${monimeRes.status}`, details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await monimeRes.json();
    const result = session.result || session;
    const checkoutUrl = result.redirectUrl || result.checkoutUrl || result.url;
    const sessionId = result.id || result.sessionId || result.checkoutSessionId;

    if (!checkoutUrl || !sessionId) {
      return new Response(JSON.stringify({ error: "Invalid Monime response", details: JSON.stringify(session) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertErr } = await supabase.from("monime_payments").insert({
      user_id: user.id,
      checkout_session_id: sessionId,
      reference: finalRef,
      amount_sle: Math.round(amount),
      status: "pending",
      purpose,
      related_id: related_id || null,
      checkout_url: checkoutUrl,
    });

    if (insertErr) {
      console.error("Failed to insert monime_payment:", insertErr.message);
      return new Response(JSON.stringify({ error: "Failed to create payment record" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ checkoutUrl, sessionId, reference: finalRef }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
