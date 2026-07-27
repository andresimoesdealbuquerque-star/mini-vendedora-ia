/**
 * Cliente da API Clint (https://api.clint.digital).
 *
 * Endpoints usados:
 *   GET  /v1/contacts                        → lista contatos (paginação por offset/limit)
 *   GET  /v2/chats/contact/{contactId}       → chats do contato (ordenado por last_message_at desc)
 *   GET  /v2/messages/chat/{chatId}          → mensagens de um chat
 *   POST /v2/messages/text                   → envia mensagem de texto (WhatsApp/Instagram)
 *
 * Auth: header `api-token`.
 * Plano: Elite (a API só é liberada nesse plano).
 *
 * Doc: https://clint-api.readme.io/reference
 */

const BASE_URL = "https://api.clint.digital";

export interface ClintError {
  ok: false;
  erro: string;
  status?: number;
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
    return { ok: false, erro: "CLINT_API_TOKEN não configurada" };
  }
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "api-token": tok,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!r.ok) {
      const body = await r.text();
      return { ok: false, erro: `Clint API ${r.status}: ${body.slice(0, 200)}`, status: r.status };
    }
    return { ok: true, data: (await r.json()) as T };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "erro de rede" };
  }
}

// ── Tipos (validar quando token estiver ativo) ───────────────────────────

export interface ContatoClint {
  id: string;
  name?: string;
  phone?: string;
  ddi?: string;
  fullPhone?: string;
  email?: string;
  username?: string;
  created_at?: string;
  updated_at?: string;
  organization?: unknown;
  tags?: unknown[];
  fields?: unknown;
  [k: string]: unknown;
}

export interface ChatClint {
  id: string;
  contact_id?: string;
  user_id?: string | null;        // operador atribuído (null = sem dono)
  status?: "OPEN" | "CLOSED" | string;
  last_message_at?: string;
  last_response_at?: string;
  first_response_at?: string;
  first_customer_message_at?: string;
  channel_account_id?: string;
  team_id?: string;
  close_window_at?: string;
  seen?: boolean;
  unread?: boolean;
  replied?: boolean;
  [k: string]: unknown;
}

export interface MensagemClint {
  id: string;
  chat_id?: string;
  created_at?: string;
  user_id?: string | null;        // null/undefined = mensagem do CLIENTE; preenchido = mensagem da vendedora
  content?: string;
  content_type?: string;
  content_url?: string;
  content_object?: unknown;
  content_action?: unknown;
  type?: "USER" | "ASSISTANT" | "SYSTEM" | string;
  external_id?: string;
  source?: string;
  status?: string;
  sent?: boolean;
  seen?: boolean;
  delivered?: boolean;
  [k: string]: unknown;
}

// ── Operações ────────────────────────────────────────────────────────────

interface RespListagem<T> {
  data?: T[];
  items?: T[];
  total?: number;
  page?: number;
  [k: string]: unknown;
}

/** Lista contatos. Não tem filtro de data — pagine e filtre localmente. */
export async function listarContatos(opts: {
  limit?: number;
  offset?: number;
  page?: number;
  phone?: string;
} = {}) {
  const p = new URLSearchParams();
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset != null) p.set("offset", String(opts.offset));
  if (opts.page) p.set("page", String(opts.page));
  if (opts.phone) p.set("phone", opts.phone);
  const path = `/v1/contacts${p.toString() ? `?${p}` : ""}`;
  return clintFetch<RespListagem<ContatoClint>>(path);
}

/** Itera por todas as páginas de contatos. Cap padrão: 2000 contatos (10 páginas). */
export async function listarTodosContatos(opts: { maxPaginas?: number; porPagina?: number } = {}) {
  const porPagina = opts.porPagina ?? 200;
  const maxPaginas = opts.maxPaginas ?? 10;
  const todos: ContatoClint[] = [];
  for (let page = 1; page <= maxPaginas; page++) {
    const r = await listarContatos({ limit: porPagina, page });
    if (!r.ok) return { ok: false as const, erro: r.erro, parciais: todos };
    const lista = r.data.data ?? r.data.items ?? [];
    todos.push(...lista);
    if (lista.length < porPagina) break;
  }
  return { ok: true as const, contatos: todos };
}

/** Lista chats de um contato (já vem ordenado por last_message_at desc). */
export async function listarChatsDoContato(contatoId: string, opts: { limit?: number } = {}) {
  const p = new URLSearchParams();
  if (opts.limit) p.set("limit", String(opts.limit));
  const path = `/v2/chats/contact/${encodeURIComponent(contatoId)}${p.toString() ? `?${p}` : ""}`;
  return clintFetch<RespListagem<ChatClint>>(path);
}

/** Lista mensagens de um chat. */
export async function listarMensagensDoChat(chatId: string, opts: { limit?: number } = {}) {
  const p = new URLSearchParams();
  if (opts.limit) p.set("limit", String(opts.limit));
  const path = `/v2/messages/chat/${encodeURIComponent(chatId)}${p.toString() ? `?${p}` : ""}`;
  return clintFetch<RespListagem<MensagemClint>>(path);
}

/**
 * Envia mensagem de texto via API do Clint.
 * O Clint exige TODOS os 3 IDs: chat, channel_account, contact.
 * Retorna 400 "Messaging window is closed" se cliente não escreveu < 24h.
 */
export async function enviarMensagem(input: {
  chat_id: string;
  channel_account_id: string;
  contact_id: string;
  message: string;
}) {
  return clintFetch<{
    data: { success: boolean; message_id: string; chat_id: string; status: string };
  }>(`/v2/messages/text`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Envia IMAGEM via URL pública. Clint suporta caption.
 * Mesma janela 24h que /text.
 */
export async function enviarMensagemImagem(input: {
  chat_id: string;
  channel_account_id: string;
  contact_id: string;
  url: string;
  caption?: string;
}) {
  return clintFetch<{
    data: { success: boolean; message_id: string; chat_id: string; status: string };
  }>(`/v2/messages/image`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Busca contatos por telefone (útil pra achar duplicatas). */
export async function buscarContatosPorTelefone(fullPhone: string) {
  const ddi = fullPhone.startsWith("+") ? fullPhone.slice(1, 3) : fullPhone.slice(0, 2);
  const phone = fullPhone.replace(/\D/g, "").slice(ddi.length);
  return clintFetch<{ data: ContatoClint[]; totalCount: number }>(
    `/v1/contacts?ddi=${ddi}&phone=${phone}&limit=10`,
  );
}

export interface ChannelAccountClint {
  id: string;
  name: string;
  type: "WHATSAPP_OFFICIAL" | "WHATSAPP" | "INSTAGRAM" | string;
  status: "CONNECTED" | "CANCELLED" | string;
  identifier?: string;
}

/** Lista canais conectados (WhatsApp Oficial, Instagram, etc). */
export async function listarCanais() {
  return clintFetch<{ data: ChannelAccountClint[] }>(`/v2/channel-accounts?limit=20`);
}

export interface UsuarioClint {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  [k: string]: unknown;
}

/** Lista usuários (vendedores/operadores) da conta Clint. */
export async function listarUsuarios() {
  return clintFetch<{ data: UsuarioClint[] }>(`/v1/users?limit=100`);
}

export interface DealClint {
  id: string;
  origin_id?: string;
  user?: { id: string; first_name?: string; last_name?: string } | null;
  contact: {
    id: string;
    name?: string;
    email?: string | null;
    phone?: string;
    ddi?: string;
    instagram?: string | null;
  };
  created_at?: string;
  updated_stage_at?: string;
  updated_at?: string;
  status?: "OPEN" | "WON" | "LOST" | string;
  won_at?: string | null;
  won_by?: string | null;
  lost_at?: string | null;
  lost_by?: string | null;
  stage?: string;
  stage_id?: string;
  value?: number;
  [k: string]: unknown;
}

/** Lista deals (negócios) — a fonte da verdade da atividade do funil. */
export async function listarDeals(opts: { page?: number; limit?: number } = {}) {
  const p = new URLSearchParams();
  p.set("limit", String(opts.limit ?? 200));
  p.set("page", String(opts.page ?? 1));
  return clintFetch<{ data: DealClint[]; totalCount: number; totalPages: number; hasNext: boolean }>(
    `/v1/deals?${p}`,
  );
}

/** Pagina deals e filtra localmente por `updated_at` no período. */
export async function listarDealsPorPeriodo(opts: {
  dataInicio: string;
  dataFim: string;
  maxPaginas?: number;
}) {
  const desdeMs = new Date(opts.dataInicio).getTime();
  const ateMs = new Date(opts.dataFim).getTime();
  const maxPaginas = opts.maxPaginas ?? 200;   // 200 páginas × 200 = 40k deals
  const filtrados: DealClint[] = [];
  let paginasLidas = 0;
  for (let page = 1; page <= maxPaginas; page++) {
    const r = await listarDeals({ page, limit: 200 });
    if (!r.ok) return { ok: false as const, erro: r.erro, parciais: filtrados };
    paginasLidas = page;
    const lista = r.data.data ?? [];
    for (const d of lista) {
      const ref = d.updated_at || d.updated_stage_at || d.created_at;
      if (!ref) continue;
      const t = new Date(ref).getTime();
      if (t >= desdeMs && t <= ateMs) filtrados.push(d);
    }
    if (!r.data.hasNext) break;
  }
  return { ok: true as const, deals: filtrados, paginas_lidas: paginasLidas };
}
