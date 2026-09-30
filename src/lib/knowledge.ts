import { supabase } from './supabase';

export interface HelpHit {
  article_id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  rank: number;
}

export async function searchHelp(query: string): Promise<{ hits: HelpHit[]; mode: string }> {
  const q = query.trim();
  try {
    const { data, error } = await supabase.functions.invoke('search-knowledge', {
      body: { query: q, limit: 5 },
    });
    if (!error && Array.isArray(data?.hits)) {
      return { hits: data.hits as HelpHit[], mode: data.mode || 'keyword' };
    }
  } catch {
    /* fall through to RPC */
  }
  const { data } = await supabase.rpc('search_knowledge', { p_query: q, p_limit: 5 });
  return { hits: (data || []) as HelpHit[], mode: 'keyword' };
}
