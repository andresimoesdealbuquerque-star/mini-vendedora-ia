import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase do ARCO DECK (projeto separado da vendedora-ia). Usado pra
// ler os projetos/eventos e montar o aviso de "novo negócio" pro projetista.
let _client: SupabaseClient | null = null;

export function arcodeck(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.ARCODECK_SUPABASE_URL;
  const key = process.env.ARCODECK_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "Arco Deck Supabase não configurado. Defina ARCODECK_SUPABASE_URL e ARCODECK_SUPABASE_KEY.",
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
