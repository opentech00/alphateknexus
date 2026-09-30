import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { refreshMonimeSession } from "../_shared/monimeFulfill.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isProcessCaller(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!token) return false;
  return token === serviceKey || token === anonKey;
}

async function embedText(text: string): Promise<number[] | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}`);
  const body = await res.json();
  const vec = body?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!isProcessCaller(req)) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  await supabase.rpc("reclaim_stale_jobs");
  const { data: jobs, error } = await supabase.rpc("claim_jobs", { p_limit: 8, p_worker: "process-jobs" });
  if (error) return json({ error: error.message }, 500);

  const claimed = (Array.isArray(jobs) ? jobs : jobs ? [jobs] : []) as {
    id: number; kind: string; payload: Record<string, unknown>;
  }[];
  let done = 0;
  let failed = 0;

  for (const job of claimed) {
    try {
      if (job.kind === "index_article") {
        const articleId = String(job.payload.article_id || "");
        if (!articleId) throw new Error("missing article_id");
        const { data: article } = await supabase
          .from("knowledge_articles")
          .select("id, title, body")
          .eq("id", articleId)
          .maybeSingle();
        if (!article) throw new Error("article not found");
        const vec = await embedText(`${article.title}\n\n${article.body}`);
        if (vec) {
          const literal = `[${vec.join(",")}]`;
          const { error: upErr } = await supabase
            .from("knowledge_articles")
            .update({ embedding: literal, updated_at: new Date().toISOString() })
            .eq("id", article.id);
          if (upErr) throw new Error(upErr.message);
        }
      } else if (job.kind === "retry_monime") {
        const reference = String(job.payload.reference || "");
        if (!reference) throw new Error("missing reference");
        const { data: payment } = await supabase
          .from("monime_payments")
          .select("*")
          .eq("reference", reference)
          .maybeSingle();
        if (!payment) throw new Error("payment not found");
        if (payment.status === "pending") {
          await refreshMonimeSession(supabase, payment, "job_retry");
        }
      } else {
        throw new Error(`unknown kind: ${job.kind}`);
      }
      await supabase.rpc("finish_job", { p_id: job.id });
      done += 1;
    } catch (err) {
      failed += 1;
      await supabase.rpc("finish_job", {
        p_id: job.id,
        p_error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return json({ claimed: claimed.length, done, failed });
});
