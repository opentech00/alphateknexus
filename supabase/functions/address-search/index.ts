import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();

    if (!q || q.length < 3) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
    nominatimUrl.searchParams.set("q", q);
    nominatimUrl.searchParams.set("format", "json");
    nominatimUrl.searchParams.set("addressdetails", "1");
    nominatimUrl.searchParams.set("limit", "6");

    const res = await fetch(nominatimUrl.toString(), {
      headers: {
        "User-Agent": "AlphaTekNexus-Client/1.0 (contact@alphateknexus.com)",
        "Accept-Language": "en",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Geocoding service unavailable" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const raw: NominatimResult[] = await res.json();

    const results = raw.map((r) => {
      const a = r.address || {};
      const city = a.city || a.town || a.village || a.county || "";
      const line = [a.house_number, a.road].filter(Boolean).join(" ").trim();
      return {
        display_name: r.display_name,
        address_line: line || r.display_name.split(",").slice(0, 2).join(", ").trim(),
        city,
        region: a.state || "",
        postal_code: a.postcode || "",
        country: a.country || "",
        country_code: (a.country_code || "").toUpperCase(),
        latitude: parseFloat(r.lat) || null,
        longitude: parseFloat(r.lon) || null,
      };
    });

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
