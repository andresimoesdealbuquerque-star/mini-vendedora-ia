import { NextResponse } from "next/server";
import { sincronizarUltimos90Dias } from "@/lib/clint/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/clint/sync — puxa conversas dos últimos 90 dias (ou mock se
 * CLINT_API_TOKEN não configurada) e salva no cache do Supabase.
 */
export async function POST() {
  const r = await sincronizarUltimos90Dias();
  return NextResponse.json(r);
}
