import { NextRequest, NextResponse } from "next/server";
import { sincronizarUltimos90Dias } from "@/lib/clint/sync";
import { clintHabilitado } from "@/lib/clint/client";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron diário: sincroniza Clint e dispara análise de novos leads frios.
 *
 * Configure em vercel.json:
 *   "crons": [{ "path": "/api/cron/recuperacao-diaria", "schedule": "0 12 * * *" }]
 *
 * Roda 12h UTC = 9h Brasília.
 */
export async function GET(req: NextRequest) {
  // Auth simples — Vercel manda x-vercel-cron header, ou usa CRON_SECRET
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  if (!clintHabilitado()) {
    return NextResponse.json({ ok: false, motivo: "CLINT_API_TOKEN não configurada — cron pulado" });
  }

  const sync = await sincronizarUltimos90Dias();

  // Após sync, dispara análise (chamando endpoint interno)
  const url = new URL(req.url);
  url.pathname = "/api/admin/recuperacao/analisar";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limite: 20 }),
  });
  const dAnal = await r.json();

  return NextResponse.json({ sync, analise: dAnal });
}
