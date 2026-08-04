import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase do ARCO DECK (projeto separado da vendedora-ia). Usado pra
// ler os projetos e montar o aviso de "novo negócio" pro projetista.
//
// A URL e a anon key são PÚBLICAS (a anon key já vai no bundle do navegador do
// Arco Deck), então ficam fixas aqui como fallback. As envs sobrescrevem SÓ se
// forem válidas (ASCII) — evita o caso de env colada com caractere estranho
// (ex.: "•") que quebrava o header da requisição.
const ARCO_URL = "https://ijlpzkqmxgxuphevngfm.supabase.co";
const ARCO_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqbHB6a3FteGd4dXBoZXZuZ2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTU0MjgsImV4cCI6MjA5NjY5MTQyOH0.fDFLBI-sk9xkj8MrVDESyAI0UNI_7z7w_Xi57HV2hhM";

const soAscii = (s: string | undefined | null) =>
  !!s && /^[\x20-\x7E]+$/.test(s);

let _client: SupabaseClient | null = null;

export function arcodeck(): SupabaseClient {
  if (_client) return _client;
  const url = soAscii(process.env.ARCODECK_SUPABASE_URL)
    ? (process.env.ARCODECK_SUPABASE_URL as string)
    : ARCO_URL;
  const key = soAscii(process.env.ARCODECK_SUPABASE_KEY)
    ? (process.env.ARCODECK_SUPABASE_KEY as string)
    : ARCO_ANON;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
