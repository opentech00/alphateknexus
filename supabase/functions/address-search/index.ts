import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FREETOWN_PROXIMITY = "-13.2317,8.484";

interface MappedPlace {
  display_name: string;
  address_line: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapboxToken(): string {
  return (Deno.env.get("MAPBOX_ACCESS_TOKEN") || Deno.env.get("MAPBOX_TOKEN") || "").trim();
}

function contextText(context: { id?: string; text?: string; short_code?: string }[] | undefined, prefix: string) {
  return context?.find((c) => (c.id || "").startsWith(prefix));
}

function mapMapboxFeature(f: any): MappedPlace {
  const ctx = f.context || [];
  const place = contextText(ctx, "place") || contextText(ctx, "locality") || contextText(ctx, "district");
  const region = contextText(ctx, "region");
  const postcode = contextText(ctx, "postcode");
  const country = contextText(ctx, "country");
  const street = [f.address, f.text].filter(Boolean).join(" ").trim();
  const [lng, lat] = f.center || f.geometry?.coordinates || [null, null];
  return {
    display_name: f.place_name || street,
    address_line: street || (f.place_name || "").split(",")[0],
    city: place?.text || "",
    region: region?.text || "",
    postal_code: postcode?.text || "",
    country: country?.text || "",
    country_code: (country?.short_code || "").replace("iso3166-1:", "").toUpperCase(),
    latitude: typeof lat === "number" ? lat : parseFloat(lat) || null,
    longitude: typeof lng === "number" ? lng : parseFloat(lng) || null,
  };
}

async function mapboxGeocode(params: { q?: string; lat?: string; lon?: string; countrycodes?: string }) {
  const token = mapboxToken();
  if (!token) return null;

  const { q, lat, lon, countrycodes } = params;
  const endpoint = lat && lon
    ? `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${lon},${lat}`)}.json`
    : `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q || "")}.json`;

  const url = new URL(endpoint);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", lat && lon ? "1" : "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("proximity", FREETOWN_PROXIMITY);
  if (!lat && !lon) url.searchParams.set("types", "address,poi,place,locality,neighborhood");
  if (countrycodes) url.searchParams.set("country", countrycodes.split(",")[0]);

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const payload = await res.json();
  return (payload.features || []).map(mapMapboxFeature) as MappedPlace[];
}

async function nominatimGeocode(params: { q?: string; lat?: string; lon?: string; countrycodes?: string }) {
  const { q, lat, lon, countrycodes } = params;
  const nominatimUrl = lat && lon
    ? new URL("https://nominatim.openstreetmap.org/reverse")
    : new URL("https://nominatim.openstreetmap.org/search");

  nominatimUrl.searchParams.set("format", "json");
  nominatimUrl.searchParams.set("addressdetails", "1");

  if (lat && lon) {
    nominatimUrl.searchParams.set("lat", lat);
    nominatimUrl.searchParams.set("lon", lon);
  } else {
    nominatimUrl.searchParams.set("q", q || "");
    nominatimUrl.searchParams.set("limit", "6");
    if (countrycodes) nominatimUrl.searchParams.set("countrycodes", countrycodes);
  }

  const res = await fetch(nominatimUrl.toString(), {
    headers: {
      "User-Agent": "AlphaTekNexus-Client/1.0 (contact@alphateknexus.com)",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) return [];
  const payload = await res.json();
  const raw = Array.isArray(payload) ? payload : payload?.display_name ? [payload] : [];
  return raw.map((r: any) => {
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
    } as MappedPlace;
  });
}

async function mapboxDirections(fromLon: string, fromLat: string, toLon: string, toLat: string) {
  const token = mapboxToken();
  if (!token) return null;
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLon},${fromLat};${toLon},${toLat}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("alternatives", "false");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const payload = await res.json();
  const route = payload.routes?.[0];
  if (!route) return null;
  return {
    coordinates: route.geometry?.coordinates || [],
    distance_meters: route.distance,
    duration_seconds: route.duration,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const lat = url.searchParams.get("lat")?.trim();
    const lon = url.searchParams.get("lon")?.trim();
    const countrycodes = url.searchParams.get("countrycodes")?.trim();
    const fromLat = url.searchParams.get("from_lat")?.trim();
    const fromLon = url.searchParams.get("from_lon")?.trim();
    const toLat = url.searchParams.get("to_lat")?.trim();
    const toLon = url.searchParams.get("to_lon")?.trim();

    if (fromLat && fromLon && toLat && toLon) {
      const route = await mapboxDirections(fromLon, fromLat, toLon, toLat);
      if (!route) return json({ error: "Directions unavailable. Set MAPBOX_ACCESS_TOKEN on the edge function." }, 502);
      return json({ route });
    }

    if (!lat && !lon && (!q || q.length < 3)) {
      return json({ results: [] });
    }

    const fromMapbox = await mapboxGeocode({ q, lat, lon, countrycodes });
    if (fromMapbox && fromMapbox.length > 0) {
      return json({ results: fromMapbox, provider: "mapbox" });
    }

    const fromOsm = await nominatimGeocode({ q, lat, lon, countrycodes });
    return json({ results: fromOsm, provider: "nominatim" });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
