import { NextRequest, NextResponse } from "next/server";
import { sincronizarPorDeals } from "@/lib/clint/sync-deals";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/clint/sync-deals
 * body: { dataInicio: ISO, dataFim: ISO, maxPaginas?: 200, maxDeals?: number }
 *
 * Sincroniza baseado em /v1/deals (fonte real do funil).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.dataInicio || !body.dataFim) {
    return NextResponse.json({ erro: "dataInicio e dataFim são obrigatórios" }, { status: 400 });
  }
  const r = await sincronizarPorDeals({
    dataInicio: body.dataInicio,
    dataFim: body.dataFim,
    maxPaginas: body.maxPaginas,
    maxDeals: body.maxDeals,
  });
  return NextResponse.json(r);
}
