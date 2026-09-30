import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function embedQuery(text: string): Promise<number[] | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 2000) }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const vec = body?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const { query, limit } = await req.json().catch(() => ({ query: "", limit: 5 }));
  const q = String(query || "").trim();
  const cap = Math.min(Math.max(Number(limit) || 5, 1), 12);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const embedding = q.length >= 3 ? await embedQuery(q) : null;
  if (embedding) {
    const { data, error } = await admin.rpc("match_knowledge_embedding", {
      p_embedding: embedding,
      p_limit: cap,
    });
    if (!error && data?.length) {
      return json({ hits: data, mode: "semantic" });
    }
  }

  const { data, error } = await supabase.rpc("search_knowledge", {
    p_query: q,
    p_limit: cap,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ hits: data || [], mode: "keyword" });
});
