import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * GET /api/admin/panorama?dias=90
 *
 * Retorna dashboard consolidado: totais, taxa de fechamento, distribuição de
 * motivos, comparativo por vendedora, insights automáticos.
 */
export async function GET(req: NextRequest) {
  const dias = Number(req.nextUrl.searchParams.get("dias") ?? 90);
  const dataInicio = req.nextUrl.searchParams.get("dataInicio");
  const dataFim = req.nextUrl.searchParams.get("dataFim");
  const desde = dataInicio ?? new Date(Date.now() - dias * 86400000).toISOString();
  const ate = dataFim ?? new Date().toISOString();

  let query = supabase.from("mila_analise_perda").select("*")
    .gte("ultima_msg_em", desde)
    .lte("ultima_msg_em", ate);
  const analisesQ = await query;
  if (analisesQ.error) return NextResponse.json({ erro: analisesQ.error.message }, { status: 500 });

  const analises = analisesQ.data ?? [];
  const total = analises.length;
  const fechados = analises.filter((a) => a.desfecho === "fechado");
  const perdidos = analises.filter((a) => a.desfecho === "perdido");
  const emAndamento = analises.filter((a) => a.desfecho === "em_andamento");

  // Distribuição de motivos entre os PERDIDOS
  const motivosCount: Record<string, number> = {};
  for (const p of perdidos) {
    const m = p.motivo_principal || "sem_motivo_claro";
    motivosCount[m] = (motivosCount[m] || 0) + 1;
  }
  const motivos = Object.entries(motivosCount)
    .map(([motivo, count]) => ({ motivo, count, pct: perdidos.length ? Math.round((count / perdidos.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Por vendedora
  const usersQ = await supabase.from("clint_usuarios").select("clint_id, nome, email").eq("ativo", true);
  const users = usersQ.data ?? [];
  const porVendedora = users
    .filter((u) => {
      const e = u.email?.toLowerCase() ?? "";
      return !e.includes("suporte") && !e.includes("andresimoes");
    })
    .map((u) => {
      const seus = analises.filter((a) => a.vendedor_clint_id === u.clint_id);
      const sFechados = seus.filter((a) => a.desfecho === "fechado").length;
      const sPerdidos = seus.filter((a) => a.desfecho === "perdido").length;
      const taxa = seus.length ? Math.round((sFechados / seus.length) * 100) : 0;
      const principalPerda = (() => {
        const cnt: Record<string, number> = {};
        seus.filter((a) => a.desfecho === "perdido").forEach((a) => {
          const m = a.motivo_principal || "sem_motivo_claro";
          cnt[m] = (cnt[m] || 0) + 1;
        });
        return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      })();
      return {
        vendedor: u,
        total: seus.length,
        fechados: sFechados,
        perdidos: sPerdidos,
        em_andamento: seus.length - sFechados - sPerdidos,
        taxa_fechamento_pct: taxa,
        principal_motivo_perda: principalPerda,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Insights automáticos (regras determinísticas simples)
  const insights: string[] = [];
  const respRapida = analises.filter((a) => a.minutos_ate_primeira_resposta != null && a.minutos_ate_primeira_resposta < 120);
  const respLenta = analises.filter((a) => a.minutos_ate_primeira_resposta != null && a.minutos_ate_primeira_resposta >= 120);
  if (respRapida.length && respLenta.length) {
    const taxaR = Math.round((respRapida.filter((a) => a.desfecho === "fechado").length / respRapida.length) * 100);
    const taxaL = Math.round((respLenta.filter((a) => a.desfecho === "fechado").length / respLenta.length) * 100);
    if (taxaR > taxaL) {
      insights.push(`Respondendo em <2h a taxa de fechamento é ${taxaR}%; acima de 2h cai pra ${taxaL}%.`);
    }
  }
  const errosComerciais = perdidos.filter((a) => a.motivo_principal === "erro_comercial").length;
  if (errosComerciais > 0) {
    insights.push(`${errosComerciais} leads perdidos por erro comercial (desconto/frete/prazo cotado errado).`);
  }
  const foraEscopo = perdidos.filter((a) => a.motivo_principal === "fora_do_escopo").length;
  if (foraEscopo > 2) {
    insights.push(`${foraEscopo} clientes chegaram pedindo algo fora do escopo — oportunidade de tabela de "alternativas" (ex: cama → cabeceira).`);
  }
  const somem = perdidos.filter((a) => a.motivo_principal === "vendedora_sumiu").length;
  if (somem > 0) {
    insights.push(`Em ${somem} conversas a vendedora prometeu retorno e não voltou — protocolo de follow-up urgente.`);
  }
  const prazoLenta = respLenta.length ? Math.round((respLenta.length / analises.filter((a) => a.minutos_ate_primeira_resposta != null).length) * 100) : 0;
  if (prazoLenta > 30) {
    insights.push(`${prazoLenta}% das conversas tiveram primeira resposta > 2h.`);
  }

  return NextResponse.json({
    periodo: { dias, desde, ate },
    totais: {
      total_analisados: total,
      fechados: fechados.length,
      perdidos: perdidos.length,
      em_andamento: emAndamento.length,
      taxa_fechamento_pct: total ? Math.round((fechados.length / total) * 100) : 0,
    },
    motivos_perda: motivos,
    por_vendedora: porVendedora,
    insights,
  });
}
