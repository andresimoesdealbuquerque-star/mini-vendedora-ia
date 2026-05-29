import { NextRequest, NextResponse } from "next/server";
import { runPlayground, type PlaygroundMessage } from "@/lib/ai/playground";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada. Adicione em .env.local e reinicie o dev server." },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json()) as { history: PlaygroundMessage[]; message: string };
    const result = await runPlayground(body.history ?? [], body.message);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "erro desconhecido" },
      { status: 500 },
    );
  }
}
