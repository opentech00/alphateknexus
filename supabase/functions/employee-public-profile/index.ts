import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("id");
    if (!employeeId) {
      return new Response(JSON.stringify({ error: "Missing id parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: emp, error } = await supabase
      .from("employees")
      .select("id, full_name, employee_number, photo_url, status, hr_roles(name), services(name)")
      .eq("id", employeeId)
      .maybeSingle();

    if (error || !emp) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      full_name: emp.full_name,
      employee_number: emp.employee_number,
      photo_url: emp.photo_url,
      status: emp.status,
      role: (emp as any).hr_roles?.name || null,
      division: (emp as any).services?.name || null,
      company: "Alphatek Nexus",
      company_phone: "+232 76 100 200",
      company_email: "info@alphateknexus.com",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("employee-public-profile error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Profile lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
