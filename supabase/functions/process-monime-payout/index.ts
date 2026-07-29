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
    const { withdrawal_id } = await req.json();

    if (!withdrawal_id) {
      return new Response(JSON.stringify({ error: "Missing withdrawal_id" }), {
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

    const { data: withdrawal, error: wErr } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawal_id)
      .maybeSingle();

    if (wErr || !withdrawal) {
      return new Response(JSON.stringify({ error: "Withdrawal not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow the withdrawal owner or an admin to process
    const isOwner = withdrawal.user_id === user.id;
    if (!isOwner) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!adminProfile || adminProfile.role !== "admin") {
        return new Response(JSON.stringify({ error: "Only the account owner or an admin can process this payout" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (withdrawal.status !== "approved" && withdrawal.status !== "pending") {
      return new Response(JSON.stringify({ error: `Cannot process a ${withdrawal.status} withdrawal` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (withdrawal.payout_method !== "mobile_money") {
      return new Response(JSON.stringify({ error: "This function only handles mobile money payouts" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = withdrawal.payout_details?.phone;
    const providerId = withdrawal.payout_details?.provider_id;

    if (!phone) {
      return new Response(JSON.stringify({ error: "No phone number on withdrawal request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!providerId) {
      return new Response(JSON.stringify({ error: "No mobile money provider selected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monimeKey = Deno.env.get("MONIME_ACCESS_KEY");
    const spaceId = Deno.env.get("MONIME_SPACE_ID");

    if (!monimeKey || !spaceId) {
      return new Response(JSON.stringify({ error: "Monime not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idempotencyKey = `payout-${withdrawal_id}`;

    const monimeRes = await fetch("https://api.monime.io/v1/payouts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${monimeKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "Monime-Space-Id": spaceId,
        "Monime-Version": "caph.2025-08-23",
      },
      body: JSON.stringify({
        amount: {
          currency: "SLE",
          value: Math.round(Number(withdrawal.amount_sle) * 100),
        },
        destination: {
          type: "momo",
          providerId: providerId,
          phoneNumber: phone,
        },
        metadata: {
          withdrawal_id: withdrawal_id,
          user_id: withdrawal.user_id,
        },
      }),
    });

    const monimeData = await monimeRes.json();

    if (!monimeRes.ok) {
      const errMsg = monimeData?.error?.message || monimeData?.message || `Monime API error: ${monimeRes.status}`;
      return new Response(JSON.stringify({ error: "Monime payout failed", details: errMsg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payout = monimeData.result || monimeData;
    const payoutId = payout?.id;
    const payoutStatus = payout?.status || "pending";

    const { error: rpcErr } = await supabase.rpc("process_withdrawal_completion", {
      p_withdrawal_id: withdrawal_id,
    });

    if (rpcErr) {
      return new Response(JSON.stringify({ error: "Payout sent but failed to update wallet: " + rpcErr.message, payout_id: payoutId }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("withdrawal_requests").update({
      reference: payoutId || null,
      admin_note: `Automatic Monime payout ${payoutId || ""} - status: ${payoutStatus}`,
    }).eq("id", withdrawal_id);

    return new Response(JSON.stringify({
      success: true,
      payout_id: payoutId,
      payout_status: payoutStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
