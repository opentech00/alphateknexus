import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface CampaignRow {
  id: string;
  title: string;
  body: string;
  email_body: string | null;
  media_url: string | null;
  kind: string;
  audience: string;
  audience_days: number;
  service_slugs: string[] | null;
  channel_email: boolean;
  channel_push: boolean;
  channel_in_app: boolean;
  status: string;
  expires_at: string | null;
  cta_page: string | null;
  cta_label: string | null;
}

interface AudienceBreakdown {
  total: number;
  email: number;
  push: number;
  inApp: number;
  pushRegistered: number;
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
): Promise<{ userIds: string[]; breakdown: AudienceBreakdown }> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, created_at")
    .neq("role", "admin");

  const allProfiles = (profiles || []) as { id: string; created_at: string }[];
  let audienceIds = new Set(allProfiles.map((profile) => profile.id));
  const days = Math.min(365, Math.max(1, Number(campaign.audience_days || 30)));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  if (campaign.audience === "service" && (campaign.service_slugs || []).length > 0) {
    const { data: services } = await admin
      .from("services")
      .select("id")
      .in("slug", campaign.service_slugs as string[]);
    const serviceIds = (services || []).map((s: { id: string }) => s.id);
    if (serviceIds.length === 0) audienceIds = new Set();

    if (serviceIds.length > 0) {
      const { data: bookings } = await admin
        .from("bookings")
        .select("user_id")
        .in("service_id", serviceIds)
        .not("user_id", "is", null);

      audienceIds = new Set((bookings || []).map((b: { user_id: string }) => b.user_id).filter(Boolean));
    }
  } else if (campaign.audience === "new_clients") {
    audienceIds = new Set(
      allProfiles.filter((profile) => profile.created_at >= cutoff).map((profile) => profile.id),
    );
  } else if (campaign.audience === "inactive_clients") {
    const { data: recentBookings } = await admin
      .from("bookings")
      .select("user_id")
      .gte("created_at", cutoff)
      .not("user_id", "is", null);
    const activeIds = new Set((recentBookings || []).map((booking: { user_id: string }) => booking.user_id));
    audienceIds = new Set(
      allProfiles
        .filter((profile) => profile.created_at < cutoff && !activeIds.has(profile.id))
        .map((profile) => profile.id),
    );
  } else if (campaign.audience === "recent_bookers") {
    const { data: recentBookings } = await admin
      .from("bookings")
      .select("user_id")
      .gte("created_at", cutoff)
      .not("user_id", "is", null);
    audienceIds = new Set(
      (recentBookings || []).map((booking: { user_id: string }) => booking.user_id).filter(Boolean),
    );
  } else if (campaign.audience === "wallet_users") {
    const { data: walletRows } = await admin
      .from("wallet_transactions")
      .select("user_id")
      .eq("status", "completed")
      .not("user_id", "is", null);
    audienceIds = new Set(
      (walletRows || []).map((row: { user_id: string }) => row.user_id).filter(Boolean),
    );
  }

  const candidateIds = [...audienceIds];
  if (candidateIds.length === 0) {
    return { userIds: [], breakdown: { total: 0, email: 0, push: 0, inApp: 0, pushRegistered: 0 } };
  }

  const [{ data: preferences }, { data: subscriptions }] = await Promise.all([
    admin
      .from("notification_preferences")
      .select("user_id, email_enabled, push_enabled, in_app_enabled, cat_marketing")
      .in("user_id", candidateIds),
    admin
      .from("push_subscriptions")
      .select("user_id")
      .in("user_id", candidateIds)
      .eq("is_active", true),
  ]);

  const preferenceByUser = new Map(
    (preferences || []).map((preference: {
      user_id: string;
      email_enabled: boolean;
      push_enabled: boolean;
      in_app_enabled: boolean;
      cat_marketing: boolean;
    }) => [preference.user_id, preference]),
  );
  const pushUsers = new Set((subscriptions || []).map((subscription: { user_id: string }) => subscription.user_id));
  const breakdown: AudienceBreakdown = { total: 0, email: 0, push: 0, inApp: 0, pushRegistered: 0 };
  const userIds = candidateIds.filter((userId) => {
    const preference = preferenceByUser.get(userId);
    if (preference?.cat_marketing === false) return false;
    const email = campaign.channel_email && preference?.email_enabled !== false;
    const push = campaign.channel_push && preference?.push_enabled !== false;
    const pushReachable = push && pushUsers.has(userId);
    const inApp = campaign.channel_in_app && preference?.in_app_enabled !== false;
    if (!email && !pushReachable && !inApp) return false;
    breakdown.total += 1;
    if (email) breakdown.email += 1;
    if (push) breakdown.push += 1;
    if (inApp) breakdown.inApp += 1;
    if (pushReachable) breakdown.pushRegistered += 1;
    return true;
  });

  return { userIds, breakdown };
}

async function enqueueCampaign(
  admin: SupabaseClient,
  campaign: CampaignRow,
  userIds: string[],
  isTest = false,
) {
  let enqueued = 0;
  const recipientRows: { campaign_id: string; user_id: string; outbox_id: string | null }[] = [];

  for (const userId of userIds) {
    const ctaPage = campaign.cta_page || "services";
    const appPages = new Set(["home", "services", "bookings", "account", "payments", "billing", "quotes", "support"]);
    const screen = appPages.has(ctaPage) ? ctaPage : "services";
    const link = `/?page=${encodeURIComponent(screen)}&campaign=${encodeURIComponent(campaign.id)}&campaign_channel=push`;
    const { data: outboxId, error } = await admin.rpc("enqueue_notification", {
      p_user_id: userId,
      p_recipient_role: "client",
      p_event_type: "announcement",
      p_title: campaign.title,
      p_body: campaign.body,
      p_category: isTest ? "system" : "marketing",
      p_metadata: {
        campaign_id: campaign.id,
        kind: campaign.kind,
        media_url: campaign.media_url,
        email_body: campaign.email_body,
        cta_page: campaign.cta_page,
        cta_label: campaign.cta_label,
        screen,
        link,
        channel_id: "marketing",
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
    if (!isTest) {
      recipientRows.push({
        campaign_id: campaign.id,
        user_id: userId,
        outbox_id: outboxId as string | null,
      });
    }
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
  if (campaign.expires_at && new Date(campaign.expires_at).getTime() <= Date.now()) {
    await admin.from("campaigns").update({
      status: "cancelled",
      error: "Campaign expired before it could be sent.",
    }).eq("id", campaignId);
    return { error: "Campaign expired before it could be sent." };
  }
  try {
    const { userIds } = await resolveAudience(admin, campaign);
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
      campaign?: CampaignRow;
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
      let campaign = body.campaign || null;
      if (!campaign && body.campaignId) {
        const { data } = await admin
          .from("campaigns")
          .select("*")
          .eq("id", body.campaignId)
          .maybeSingle();
        campaign = data as CampaignRow | null;
      }
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      const audience = await resolveAudience(admin, campaign);
      return json({ success: true, count: audience.userIds.length, breakdown: audience.breakdown });
    }

    if (action === "test") {
      if (!body.campaignId) return json({ error: "campaignId is required" }, 400);
      const { data: campaign } = await admin
        .from("campaigns")
        .select("*")
        .eq("id", body.campaignId)
        .maybeSingle();
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      const enqueued = await enqueueCampaign(admin, campaign as CampaignRow, [user.id], true);
      return json({ success: true, enqueuedCount: enqueued, message: "Test notification queued for your account." });
    }

    if (action === "stats") {
      if (!body.campaignId) return json({ error: "campaignId is required" }, 400);
      const [{ data: events }, { data: recipients }] = await Promise.all([
        admin
          .from("campaign_events")
          .select("event_type, channel")
          .eq("campaign_id", body.campaignId),
        admin
          .from("campaign_recipients")
          .select("outbox_id")
          .eq("campaign_id", body.campaignId),
      ]);
      const outboxIds = (recipients || [])
        .map((recipient: { outbox_id: string | null }) => recipient.outbox_id)
        .filter((id): id is string => Boolean(id));
      const delivery = { inApp: 0, email: 0, push: 0, processed: 0, errors: 0 };
      for (let offset = 0; offset < outboxIds.length; offset += 500) {
        const { data: rows } = await admin
          .from("notification_outbox")
          .select("in_app_sent, email_sent, push_sent, processed_at, error_message")
          .in("id", outboxIds.slice(offset, offset + 500));
        for (const row of rows || []) {
          if (row.in_app_sent) delivery.inApp += 1;
          if (row.email_sent) delivery.email += 1;
          if (row.push_sent) delivery.push += 1;
          if (row.processed_at) delivery.processed += 1;
          if (row.error_message) delivery.errors += 1;
        }
      }
      const engagement = { impressions: 0, clicks: 0, dismissals: 0 };
      for (const event of events || []) {
        if (event.event_type === "impression") engagement.impressions += 1;
        if (event.event_type === "click") engagement.clicks += 1;
        if (event.event_type === "dismiss") engagement.dismissals += 1;
      }
      return json({ success: true, delivery, engagement });
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

    return json({ error: "Unknown action. Use send, test, estimate, stats, or process-scheduled." }, 400);
  } catch (err) {
    console.error("send-campaign failure:", err);
    return json({ error: "Campaign dispatch failed" }, 500);
  }
});
