import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { sendText } from "@/lib/whatsapp/meta";

export const runtime = "nodejs";

/**
 * Cron de follow-up. Rodar 1x/dia via Vercel Cron.
 *
 * Lógica:
 * - Lead em "qualificacao"/"diagnostico" sem resposta há 24h → mensagem leve.
 * - Lead em "orcamento" sem resposta há 48h → revisita com pergunta direta.
 * - Lead em "agendamento" sem resposta há 24h → confirmar visita.
 * - Lead parado > 14 dias em qualquer etapa → marca como perdido.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ""}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const now = new Date();
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

  const followupBuckets = [
    {
      etapas: ["qualificacao", "diagnostico"],
      cutoff: ago(24),
      maxAge: ago(24 * 14),
      message: (nome?: string | null) =>
        `oi${nome ? `, ${nome}` : ""}! ainda dá tempo de conversar sobre seu projeto?\n\nse mudou de planos, sem problema — me avisa que arquivo aqui 😊`,
    },
    {
      etapas: ["orcamento"],
      cutoff: ago(48),
      maxAge: ago(24 * 14),
      message: (nome?: string | null) =>
        `${nome ? `${nome}, ` : ""}e aí, o que achou do orçamento?\n\nse rolar alguma dúvida ou quiser ajustar alguma coisa do projeto, me fala`,
    },
    {
      etapas: ["agendamento"],
      cutoff: ago(24),
      maxAge: ago(24 * 14),
      message: (nome?: string | null) =>
        `${nome ? `${nome}, ` : ""}só confirmando a visita — segue valendo no horário combinado?`,
    },
  ];

  let sent = 0;
  let perdidos = 0;

  for (const bucket of followupBuckets) {
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .in("etapa", bucket.etapas)
      .lt("last_message_at", bucket.cutoff)
      .gt("last_message_at", bucket.maxAge)
      .is("handed_off_at", null);

    for (const lead of leads ?? []) {
      try {
        await sendText(lead.phone, bucket.message(lead.nome));
        await supabase
          .from("leads")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", lead.id);
        sent++;
      } catch (e) {
        console.error("[followup send error]", lead.phone, e);
      }
    }
  }

  // Marca perdidos
  const { data: stale } = await supabase
    .from("leads")
    .select("id")
    .lt("last_message_at", ago(24 * 14))
    .not("etapa", "in", "(fechado,perdido)");
  for (const l of stale ?? []) {
    await supabase.from("leads").update({ etapa: "perdido" }).eq("id", l.id);
    perdidos++;
  }

  return NextResponse.json({ ok: true, sent, perdidos });
}
