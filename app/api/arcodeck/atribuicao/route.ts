import { NextRequest, NextResponse } from "next/server";
import { arcodeck } from "@/lib/arcodeck/client";
import { buscarContatosPorTelefone, listarCanais, listarTemplates, enviarTemplate } from "@/lib/clint/client";

// Webhook do Supabase do Arco Deck: dispara quando entra um evento na tabela
// `eventos`. Se for uma ATRIBUIÇÃO de projetista (a "distribuição" da Vitória),
// a Mila avisa o projetista no WhatsApp — via CLINT (mesmo número da Mila),
// usando um TEMPLATE aprovado (necessário fora da janela de 24h).
export const runtime = "nodejs";

// Projetista → WhatsApp (só dígitos, com DDI). Fornecidos pelo André.
const PROJETISTA_WHATSAPP: Record<string, string> = {
  livia: "5583999368877",
  edvando: "5583996808321",
};

// Rótulos (o Arco Deck guarda ids; deixamos a mensagem legível).
const TAMANHOS: Record<string, string> = {
  mini: "Mini",
  pequeno: "Pequeno",
  medio: "Médio",
  grande: "Grande",
};
const CANAIS: Record<string, string> = {
  insta_arco: "Insta Arco",
  indicacao: "Indicação",
  arquiteto: "Arquiteto",
  cliente_arco: "Cliente Arco",
  relacionamento: "Relacionamento",
  collab_mini: "Collab Mini",
  corretor: "Corretor",
  construtora: "Construtora",
  predio: "Prédio",
};

const soDigitos = (t?: string | null) => (t || "").replace(/\D/g, "");
const chave = (nome: string) =>
  nome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function GET() {
  return NextResponse.json({ ok: true, rota: "arcodeck/atribuicao (via Clint)" });
}

export async function POST(req: NextRequest) {
  // Segurança: segredo compartilhado no header (configurado no webhook do Supabase).
  const secret = process.env.ARCODECK_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-arcodeck-secret") !== secret) {
    return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "json inválido" }, { status: 400 });
  }

  // Supabase Database Webhook manda { type, table, record:{ id, ordem, data, created_at } }.
  const rec = (body.record as Record<string, unknown>) || {};
  const ev = ((rec.data as Record<string, unknown>) || body.data || body) as Record<string, unknown>;

  if (!ev || ev.tipo !== "atribuido") {
    return NextResponse.json({ ok: true, ignorado: "não é atribuição" });
  }

  const projetista = String(ev.para || "").trim();
  const telefone = PROJETISTA_WHATSAPP[chave(projetista)];
  if (!telefone) {
    return NextResponse.json({ ok: true, ignorado: `sem WhatsApp cadastrado para "${projetista}"` });
  }

  // 1) Canal WhatsApp Oficial (por env ou descobrindo o primeiro conectado).
  let channelId = process.env.CLINT_CHANNEL_ACCOUNT_ID || "";
  if (!channelId) {
    const canais = await listarCanais();
    if (!canais.ok) return NextResponse.json({ ok: false, erro: `canais: ${canais.erro}` }, { status: 502 });
    const oficial = (canais.data.data || []).find(
      (c) => c.type === "WHATSAPP_OFFICIAL" && c.status === "CONNECTED",
    );
    if (!oficial) return NextResponse.json({ ok: false, erro: "nenhum canal WhatsApp Oficial conectado no Clint" }, { status: 502 });
    channelId = oficial.id;
  }

  // 2) Template: acha pelo NOME entre os APROVADOS (env com o id sobrescreve).
  //    Assim, ao criar um novo modelo, basta manter o nome — não precisa mexer no código.
  const templateNome = process.env.ARCODECK_TEMPLATE_NOME || "arco_lead_atribuido";
  let templateId = process.env.CLINT_TEMPLATE_ID_ATRIBUICAO || "";
  if (!templateId) {
    const tpls = await listarTemplates(channelId);
    if (tpls.ok) {
      const t = (tpls.data.data || []).find(
        (x) => x.name === templateNome && x.status === "APPROVED",
      );
      if (t) templateId = t.id;
    }
  }
  if (!templateId) {
    return NextResponse.json(
      { ok: false, erro: `template "${templateNome}" não encontrado/aprovado no Clint` },
      { status: 500 },
    );
  }

  // 3) Contato do projetista no Clint (a busca do Clint às vezes volta vazia →
  //    tenta até 3x antes de desistir).
  let contato: { id: string } | null = null;
  for (let tent = 0; tent < 3; tent++) {
    const contatos = await buscarContatosPorTelefone(telefone);
    if (contatos.ok) {
      const c = (contatos.data.data || [])[0];
      if (c?.id) {
        contato = c;
        break;
      }
    }
    if (tent < 2) await new Promise((r) => setTimeout(r, 400));
  }
  if (!contato?.id) {
    return NextResponse.json({
      ok: true,
      ignorado: `contato ${projetista} (${telefone}) não encontrado no Clint após 3 tentativas`,
    });
  }

  // 3) Detalhes do projeto (resumo + telefone do cliente) no Supabase do Arco Deck.
  let tamanho = "—";
  let canal = "—";
  let clienteTel = "";
  let leituraErro: string | null = null;
  let rawTamanho: unknown = null;
  let rawCanal: unknown = null;
  try {
    const { data, error } = await arcodeck()
      .from("projetos")
      .select("data")
      .eq("id", ev.projetoId as string)
      .single();
    if (error) leituraErro = error.message;
    const p = (data?.data as Record<string, unknown>) || null;
    if (p) {
      rawTamanho = p.tamanho;
      rawCanal = p.canal;
      tamanho = TAMANHOS[p.tamanho as string] || "—";
      canal = CANAIS[p.canal as string] || "—";
      clienteTel = soDigitos(p.telefone as string);
    } else if (!leituraErro) {
      leituraErro = "projeto não encontrado";
    }
  } catch (e) {
    leituraErro = e instanceof Error ? e.message : String(e);
  }

  // Modo diagnóstico (?dry=1): não envia, só mostra o que foi lido.
  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({
      ok: true,
      dry: true,
      projetoId: ev.projetoId,
      leituraErro,
      rawTamanho,
      rawCanal,
      tamanho,
      canal,
      clienteTel,
    });
  }

  const cliente = String(ev.cliente || "Novo cliente");
  const projetoId = String(ev.projetoId || "");
  const linkCliente = clienteTel ? `https://wa.me/${clienteTel}` : "telefone não cadastrado";
  const linkProjeto = `https://arcodeck.arcomini.com.br/?projeto=${projetoId}`;

  // 4) Envia o template. Ordem das variáveis do corpo:
  //    {{1}} projetista · {{2}} cliente · {{3}} tamanho · {{4}} canal · {{5}} link cliente · {{6}} link projeto
  const r = await enviarTemplate({
    channel_account_id: channelId,
    contact_id: contato.id,
    template_id: templateId,
    parameters: { body: [projetista, cliente, tamanho, canal, linkCliente, linkProjeto] },
  });

  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 });
  return NextResponse.json({ ok: true, enviado_para: projetista, cliente });
}
