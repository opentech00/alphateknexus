import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CampaignRow {
  id: string;
  title: string;
  body: string;
  email_body: string | null;
  media_url: string | null;
  kind: string;
  audience: string;
  service_slugs: string[] | null;
  channel_email: boolean;
  channel_push: boolean;
  channel_in_app: boolean;
  status: string;
  cta_page: string | null;
  cta_label: string | null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: json({ error: "Missing auth token" }, 401) };
  }
  const userToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return { error: json({ error: "Invalid or expired session" }, 401) };
  }
  const { data: profile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return { error: json({ error: "Only admins can send campaigns" }, 403) };
  }
  return { user, userClient };
}

async function resolveAudience(
  admin: SupabaseClient,
  campaign: CampaignRow,
): Promise<string[]> {
  if (campaign.audience === "service" && (campaign.service_slugs || []).length > 0) {
    const { data: services } = await admin
      .from("services")
      .select("id")
      .in("slug", campaign.service_slugs as string[]);
    const serviceIds = (services || []).map((s: { id: string }) => s.id);
    if (serviceIds.length === 0) return [];

    const { data: bookings } = await admin
      .from("bookings")
      .select("user_id")
      .in("service_id", serviceIds)
      .not("user_id", "is", null);

    return [...new Set((bookings || []).map((b: { user_id: string }) => b.user_id).filter(Boolean))];
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .neq("role", "admin");

  return (profiles || []).map((p: { id: string }) => p.id);
}

async function enqueueCampaign(
  admin: SupabaseClient,
  campaign: CampaignRow,
  userIds: string[],
) {
  let enqueued = 0;
  const recipientRows: { campaign_id: string; user_id: string; outbox_id: string | null }[] = [];

  for (const userId of userIds) {
    const { data: outboxId, error } = await admin.rpc("enqueue_notification", {
      p_user_id: userId,
      p_recipient_role: "client",
      p_event_type: "announcement",
      p_title: campaign.title,
      p_body: campaign.body,
      p_category: "system",
      p_metadata: {
        campaign_id: campaign.id,
        kind: campaign.kind,
        media_url: campaign.media_url,
        email_body: campaign.email_body,
        cta_page: campaign.cta_page,
        cta_label: campaign.cta_label,
        service_slugs: (campaign.service_slugs || []).join(","),
        channels_email: campaign.channel_email,
        channels_push: campaign.channel_push,
        channels_in_app: campaign.channel_in_app,
      },
    });
    if (error) {
      console.error("enqueue_notification failed", userId, error.message);
      continue;
    }
    enqueued += 1;
    recipientRows.push({
      campaign_id: campaign.id,
      user_id: userId,
      outbox_id: outboxId as string | null,
    });
  }

  if (recipientRows.length > 0) {
    await admin.from("campaign_recipients").upsert(recipientRows, {
      onConflict: "campaign_id,user_id",
    });
  }

  return enqueued;
}

async function dispatchCampaign(admin: SupabaseClient, campaignId: string) {
  const { data: locked, error: lockErr } = await admin
    .from("campaigns")
    .update({ status: "sending", error: null })
    .eq("id", campaignId)
    .in("status", ["draft", "scheduled"])
    .select("*")
    .maybeSingle();

  if (lockErr) return { error: lockErr.message };
  if (!locked) return { error: "Campaign is not sendable (already sending, sent, or cancelled)." };

  const campaign = locked as CampaignRow;
  try {
    const userIds = await resolveAudience(admin, campaign);
    const enqueued = await enqueueCampaign(admin, campaign, userIds);
    await admin
      .from("campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: userIds.length,
        enqueued_count: enqueued,
        error: null,
      })
      .eq("id", campaignId);
    return { recipientCount: userIds.length, enqueuedCount: enqueued };
  } catch (err) {
    await admin
      .from("campaigns")
      .update({
        status: "failed",
        error: (err as Error).message,
      })
      .eq("id", campaignId);
    return { error: (err as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      action?: string;
      campaignId?: string;
    };
    const action = body.action || "send";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "process-scheduled") {
      const auth = await requireAdmin(req);
      if ("error" in auth && auth.error) return auth.error;
      const { data: due } = await admin
        .from("campaigns")
        .select("id")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .limit(10);
      const results = [];
      for (const row of due || []) {
        results.push({ id: row.id, ...(await dispatchCampaign(admin, row.id)) });
      }
      return json({ success: true, processed: results.length, results });
    }

    const auth = await requireAdmin(req);
    if ("error" in auth && auth.error) return auth.error;
    const user = auth.user!;

    if (action === "estimate") {
      const { data: campaign } = await admin
        .from("campaigns")
        .select("*")
        .eq("id", body.campaignId)
        .maybeSingle();
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      const userIds = await resolveAudience(admin, campaign as CampaignRow);
      return json({ success: true, count: userIds.length });
    }

    if (action === "test") {
      if (!body.campaignId) return json({ error: "campaignId is required" }, 400);
      const { data: campaign } = await admin
        .from("campaigns")
        .select("*")
        .eq("id", body.campaignId)
        .maybeSingle();
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      const enqueued = await enqueueCampaign(admin, campaign as CampaignRow, [user.id]);
      return json({ success: true, enqueuedCount: enqueued, message: "Test notification queued for your account." });
    }

    if (action === "send") {
      if (!body.campaignId) return json({ error: "campaignId is required" }, 400);
      const { data: sending } = await admin
        .from("campaigns")
        .select("id")
        .eq("status", "sending")
        .neq("id", body.campaignId)
        .maybeSingle();
      if (sending) {
        return json({ error: "Another campaign is currently sending. Try again in a moment." }, 409);
      }
      const result = await dispatchCampaign(admin, body.campaignId);
      if (result.error) return json({ error: result.error }, 400);
      return json({ success: true, ...result });
    }

    return json({ error: "Unknown action. Use send, test, estimate, or process-scheduled." }, 400);
  } catch (err) {
    console.error("send-campaign failure:", err);
    return json({ error: "Campaign dispatch failed" }, 500);
  }
});
