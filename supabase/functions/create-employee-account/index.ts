import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateEmployeeNumber(maxSuffix: number): string {
  return "ATN-" + String(maxSuffix + 1).padStart(4, "0");
}

// Extract the numeric suffix from an employee number like "ATN-0002".
// Returns 0 for non-matching values so they don't affect the max.
function parseSuffix(empNum: string): number {
  const match = empNum.match(/ATN-(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

async function sendWelcomeEmail(
  toEmail: string,
  fullName: string,
  employeeNumber: string,
  cardNumber: string,
  tempPassword: string,
  dashboardUrl: string,
) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping welcome email");
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:40px 0;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;padding:28px 32px;">
      <h1 style="color:#fff;font-size:20px;margin:0;">Welcome to Alphatek Nexus</h1>
      <p style="color:#94a3b8;font-size:14px;margin:6px 0 0;">Employee Portal — Your account is ready</p>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;color:#1e293b;margin:0 0 16px;">Hi ${fullName},</p>
      <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 24px;">
        Your employee account has been created. Below are your login credentials and a link to access the Employee Portal.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 24px;">
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="color:#64748b;padding:6px 0;width:140px;">Employee ID <span style="color:#059669;font-size:12px;">(login username)</span></td><td style="color:#0f172a;font-weight:600;font-family:monospace;">${employeeNumber}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0;">ID Card Number</td><td style="color:#0f172a;font-weight:600;font-family:monospace;">${cardNumber}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0;">Email</td><td style="color:#0f172a;font-weight:600;">${toEmail}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0;">Temporary Password</td><td style="color:#0f172a;font-weight:600;font-family:monospace;">${tempPassword}</td></tr>
        </table>
      </div>
      <a href="${dashboardUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:10px;">Access Employee Portal</a>
      <p style="font-size:13px;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:20px 0 0;">
        For security, you will be required to change your password on first login.
      </p>
      <p style="font-size:13px;color:#94a3b8;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:20px;">
        If you did not expect this email, please contact your administrator.<br/>© ${new Date().getFullYear()} Alphatek Nexus.
      </p>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Alphatek Nexus <onboarding@alphateknexus.com>",
      to: [toEmail],
      subject: `Welcome to Alphatek Nexus — Your Employee Portal Credentials`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend error:", res.status, body);
    return { sent: false, reason: `Resend API error: ${res.status}` };
  }
  return { sent: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const {
      full_name,
      email,
      phone,
      service_id,
      role_id,
      hire_date,
      position,
      date_of_birth,
      emergency_contact,
      address,
      photo_url,
      resume_url,
      password,
      dashboard_url,
    } = await req.json();

    if (!full_name || !email) {
      return new Response(
        JSON.stringify({ error: "full_name and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the max numeric suffix across existing employee numbers instead of
    // the row count — row count collides after rows are deleted.
    const { data: existing } = await adminClient
      .from("employees")
      .select("employee_number");

    const maxSuffix = (existing ?? []).reduce(
      (max, row) => Math.max(max, parseSuffix(row.employee_number)),
      0,
    );

    const employee_number = generateEmployeeNumber(maxSuffix);

    // Create auth account with the admin-supplied temporary password
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: "staff" },
    });

    if (authErr) {
      return new Response(
        JSON.stringify({ error: `Failed to create account: ${authErr.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = authData.user.id;

    await adminClient.from("profiles").insert({
      id: userId,
      email,
      full_name,
      phone: phone || null,
      role: "user",
    });

    const { data: employee, error: dbErr } = await adminClient.from("employees").insert({
      user_id: userId,
      employee_number,
      full_name,
      email,
      phone: phone || null,
      service_id: service_id || null,
      role_id: role_id || null,
      position: position || null,
      hire_date: hire_date || null,
      date_of_birth: date_of_birth || null,
      emergency_contact: emergency_contact || null,
      address: address || null,
      photo_url: photo_url || null,
      resume_url: resume_url || null,
      status: "active",
      must_change_password: true,
    }).select().single();

    if (dbErr) {
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: dbErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const year = new Date().getFullYear();
    const card_number = `ATN-${year}-${String(maxSuffix + 1).padStart(4, "0")}`;
    const qr_payload = JSON.stringify({ employee_id: employee.id, card_number });

    await adminClient.from("id_cards").insert({
      employee_id: employee.id,
      card_number,
      qr_payload,
      issue_date: new Date().toISOString().split("T")[0],
      expiry_date: null,
      status: "active",
    });

    // Send welcome email with credentials
    const empDashboardUrl = dashboard_url || `${supabaseUrl.replace(".supabase.co", "")}/`;
    const emailResult = await sendWelcomeEmail(
      email,
      full_name,
      employee_number,
      card_number,
      password,
      empDashboardUrl,
    );

    return new Response(
      JSON.stringify({
        employee,
        id_card_number: card_number,
        email_sent: emailResult.sent,
        email_message: emailResult.sent ? "Welcome email sent." : (emailResult.reason || "Email not sent."),
        message: "Employee created successfully.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
