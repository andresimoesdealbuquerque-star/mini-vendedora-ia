/**
 * Cliente da API Clint (https://api.clint.digital/v2/).
 *
 * Autenticação: header `api-token` com o token do plano Elite.
 * Configure CLINT_API_TOKEN no .env.local e no Vercel quando tiver acesso.
 *
 * Endpoints usados (módulo de atendimento beta):
 *   GET  /v2/contacts                  → lista contatos com filtros de data
 *   GET  /v2/chats/contact/{contactId} → lista chats de um contato
 *   GET  /v2/messages/chat/{chatId}    → lista mensagens de um chat
 *   POST /v2/messages                  → envia mensagem
 *
 * Sem token: as funções retornam erro estruturado pra UI mostrar "configure token".
 */

const BASE_URL = "https://api.clint.digital/v2";

export interface ClintError {
  ok: false;
  erro: string;
  status?: number;
  raw?: unknown;
}

export interface ClintPaginado<T> {
  ok: true;
  itens: T[];
  proxima_pagina?: string | number | null;
}

function token(): string | null {
  return process.env.CLINT_API_TOKEN || null;
}

export function clintHabilitado(): boolean {
  return !!token();
}

async function clintFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | ClintError> {
  const tok = token();
  if (!tok) {
    return { ok: false, erro: "CLINT_API_TOKEN não configurada — defina no .env.local e no Vercel" };
  }
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "api-token": tok,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!r.ok) {
      const body = await r.text();
      return { ok: false, erro: `Clint API ${r.status}: ${body.slice(0, 200)}`, status: r.status };
    }
    const data = (await r.json()) as T;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "erro de rede" };
  }
}

// ── Tipos esperados (validar com a doc do Clint quando token chegar) ─────

export interface ContatoClint {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  funnel_stage?: string;
  last_message_at?: string;
  [k: string]: unknown;
}

export interface ChatClint {
  id: string;
  contact_id?: string;
  channel?: string;
  status?: string;
  last_message_at?: string;
  [k: string]: unknown;
}

export interface MensagemClint {
  id: string;
  chat_id?: string;
  direction?: "inbound" | "outbound";
  author?: { name?: string; [k: string]: unknown };
  content?: string;
  type?: string;
  media_url?: string;
  sent_at?: string;
  [k: string]: unknown;
}

// ── Operações ────────────────────────────────────────────────────────────

/** Lista contatos. Se `desde` for passado, só com atividade após essa data. */
export async function listarContatos(opts: {
  desde?: Date;
  limite?: number;
  proxima?: string | number;
} = {}) {
  const params = new URLSearchParams();
  if (opts.limite) params.set("limit", String(opts.limite));
  if (opts.proxima) params.set("page", String(opts.proxima));
  // O Clint pode usar nomes diferentes; tentar "updated_after" e "last_message_after".
  if (opts.desde) {
    params.set("last_message_after", opts.desde.toISOString());
  }
  const path = `/contacts${params.toString() ? `?${params}` : ""}`;
  return clintFetch<{ data: ContatoClint[]; next?: string | number }>(path);
}

/** Lista chats de um contato. */
export async function listarChatsDoContato(contatoId: string) {
  return clintFetch<{ data: ChatClint[] }>(`/chats/contact/${encodeURIComponent(contatoId)}`);
}

/** Lista mensagens de um chat. */
export async function listarMensagensDoChat(chatId: string, opts: { limite?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.limite) params.set("limit", String(opts.limite));
  const path = `/messages/chat/${encodeURIComponent(chatId)}${params.toString() ? `?${params}` : ""}`;
  return clintFetch<{ data: MensagemClint[] }>(path);
}

/** Envia uma mensagem de texto. */
export async function enviarMensagem(input: {
  chat_id?: string;
  contact_id?: string;
  text: string;
}) {
  return clintFetch<{ data: MensagemClint }>(`/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
