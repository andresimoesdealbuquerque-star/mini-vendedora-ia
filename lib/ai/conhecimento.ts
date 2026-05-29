/**
 * Conhecimento aprendido — regras e exemplos que o user/designer cria via
 * /admin/playground (aba "Ensinar"). Lidos do Supabase a cada conversa,
 * com cache em memória de 1 min.
 *
 * Injetados no system prompt da Mila como seções "REGRAS APRENDIDAS" e
 * "EXEMPLOS APRENDIDOS" — funcionam idêntico no playground e na produção
 * (WhatsApp).
 */

import { supabase } from "@/lib/db/client";

export interface Regra {
  id: string;
  texto: string;
  ativa: boolean;
  ordem: number;
  criada_em: string;
  atualizada_em: string;
}

export interface Exemplo {
  id: string;
  mensagem_cliente: string;
  resposta_correta: string;
  contexto?: string | null;
  ativa: boolean;
  ordem: number;
  origem: "manual" | "playground_correcao";
  criada_em: string;
  atualizada_em: string;
}

interface ConhecimentoCache {
  regras: Regra[];
  exemplos: Exemplo[];
  carregadoEm: number;
}

const TTL_MS = 60 * 1000;
let cache: ConhecimentoCache | null = null;
let inflight: Promise<ConhecimentoCache> | null = null;

export async function carregarConhecimento(): Promise<ConhecimentoCache> {
  if (cache && Date.now() - cache.carregadoEm < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = doLoad().finally(() => { inflight = null; });
  return inflight;
}

async function doLoad(): Promise<ConhecimentoCache> {
  try {
    const [regras, exemplos] = await Promise.all([
      supabase.from("mila_regras").select("*").eq("ativa", true).order("ordem", { ascending: true }),
      supabase.from("mila_exemplos").select("*").eq("ativa", true).order("ordem", { ascending: true }),
    ]);
    cache = {
      regras: (regras.data ?? []) as Regra[],
      exemplos: (exemplos.data ?? []) as Exemplo[],
      carregadoEm: Date.now(),
    };
    return cache;
  } catch (e) {
    console.warn("[conhecimento] falhou ao carregar:", e instanceof Error ? e.message : e);
    cache = { regras: [], exemplos: [], carregadoEm: Date.now() };
    return cache;
  }
}

/** Força recarregar na próxima chamada — chame após CRUD. */
export function invalidarCacheConhecimento(): void {
  cache = null;
}

/**
 * Constrói o bloco textual com regras e exemplos pra injetar no system prompt.
 * Vazio se nada cadastrado.
 */
export function formatarConhecimentoComoTexto(c: { regras: Regra[]; exemplos: Exemplo[] }): string {
  const partes: string[] = [];

  if (c.regras.length > 0) {
    partes.push("# REGRAS APRENDIDAS (cadastradas pelo time)");
    partes.push("Siga essas regras sempre. Se entrarem em conflito com algo do prompt original, a regra aprendida tem prioridade.");
    partes.push("");
    for (const r of c.regras) {
      partes.push(`- ${r.texto}`);
    }
    partes.push("");
  }

  if (c.exemplos.length > 0) {
    partes.push("# EXEMPLOS APRENDIDOS (correções do time)");
    partes.push("Esses são pares de pergunta/resposta que o time validou. Quando aparecer caso parecido, responda no mesmo espírito.");
    partes.push("");
    for (const ex of c.exemplos) {
      if (ex.contexto) partes.push(`Contexto: ${ex.contexto}`);
      partes.push(`Cliente: "${ex.mensagem_cliente}"`);
      partes.push(`Mila: "${ex.resposta_correta}"`);
      partes.push("");
    }
  }

  return partes.join("\n");
}
