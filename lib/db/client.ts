import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Cliente Supabase em lazy-init. Só explode se ANTHROPIC_API_KEY/Supabase
 * não estiver configurado E alguém tentar usar — assim o playground roda
 * sem precisar de DB.
 */
function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Proxy: mantém a API antiga (`supabase.from(...)`) funcionando sem mudar nada.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getClient();
    return (c as any)[prop];
  },
});
