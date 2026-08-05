import { NextRequest, NextResponse } from "next/server";
import { rodarOrquestrador } from "@/lib/mila-live/orquestrador";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron a cada 1 min (Vercel Pro). Config em vercel.json.
 * Roda o orquestrador que detecta msgs novas, gera resposta e envia.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const ignorarHorario = req.nextUrl.searchParams.get("force") === "1";
  const r = await rodarOrquestrador({ ignorarHorario });
  return NextResponse.json(r);
}
