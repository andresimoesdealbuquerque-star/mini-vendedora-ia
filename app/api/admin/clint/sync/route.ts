import { NextRequest, NextResponse } from "next/server";
import { sincronizarUltimos90Dias } from "@/lib/clint/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/clint/sync
 * body:
 *   { dias?: 90, maxContatos?: 50, maxPaginas?: 10 }
 *   { dataInicio: "2026-05-01T00:00Z", dataFim: "2026-05-31T23:59Z", ... }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const r = await sincronizarUltimos90Dias({
    dias: body.dias,
    maxContatos: body.maxContatos,
    maxPaginas: body.maxPaginas,
    dataInicio: body.dataInicio,
    dataFim: body.dataFim,
  });
  return NextResponse.json(r);
}
