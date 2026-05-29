import { NextRequest, NextResponse } from "next/server";
import { handleIncomingMessage } from "@/lib/ai/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET — verificação de webhook do Meta. Configure este URL no painel do
 * WhatsApp Business com o verify_token igual ao METAWEBHOOK_VERIFY_TOKEN.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/**
 * POST — recebe mensagens do WhatsApp.
 *
 * Importante: respondemos 200 IMEDIATAMENTE pra Meta não dar timeout (limite
 * 5s). O processamento da IA roda em background. Se demorar muito, Meta
 * reentrega — por isso a dedupe por message_id em appendMessage.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const entries = body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const messages = value.messages ?? [];

      for (const msg of messages) {
        if (msg.type !== "text") continue; // TODO: áudio, imagem
        const fromPhone = msg.from as string;
        const text = msg.text?.body as string;
        const messageId = msg.id as string;

        // Fire-and-forget: responde 200 pro Meta, processa em background.
        handleIncomingMessage({ fromPhone, text, messageId }).catch((err) => {
          console.error("[agent error]", err);
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
