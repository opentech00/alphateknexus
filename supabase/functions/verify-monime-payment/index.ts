import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { refreshMonimeSession } from "../_shared/monimeFulfill.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { reference } = await req.json();
    if (!reference) return json({ error: "Missing reference" }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isAdmin = callerProfile?.role === "admin" || callerProfile?.role === "finance_manager";

    const { data: monimePayment } = await supabase
      .from("monime_payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    const allowed = monimePayment && (
      isAdmin || monimePayment.user_id === user.id || monimePayment.initiated_by === user.id
    );
    if (!allowed) return json({ error: "Payment not found" }, 404);

    const base = {
      reference: monimePayment.reference,
      purpose: monimePayment.purpose,
      related_id: monimePayment.related_id,
      kind: monimePayment.kind,
      amount: monimePayment.amount_sle,
      failure_code: monimePayment.failure_code || null,
      failure_reason: monimePayment.failure_reason || null,
    };

    if (monimePayment.status !== "pending" && monimePayment.status !== "completed" && !isAdmin) {
      return json({ ...base, status: monimePayment.status });
    }

    const refreshed = await refreshMonimeSession(supabase, monimePayment, "monime_verify");
    if (refreshed.error && refreshed.status === monimePayment.status && monimePayment.status === "pending") {
      return json({ ...base, status: "pending", warning: refreshed.error });
    }
    return json({
      ...base,
      status: refreshed.status,
      failure_code: refreshed.failure_code || base.failure_code,
      failure_reason: refreshed.failure_reason || base.failure_reason,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
