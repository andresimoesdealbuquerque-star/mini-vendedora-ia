/**
 * Cliente da Meta WhatsApp Cloud API.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Mais barato que Twilio/Z-API: Meta dá 1000 conversas iniciadas pelo usuário
 * grátis por mês, e ~R$ 0,15 por conversa adicional.
 */

const API_VERSION = "v21.0";

function endpoint(): string {
  return `https://graph.facebook.com/${API_VERSION}/${process.env.META_PHONE_NUMBER_ID}/messages`;
}

export async function sendText(toPhone: string, text: string): Promise<void> {
  const r = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body: text },
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Meta API error: ${r.status} ${err}`);
  }
}

export async function sendTypingIndicator(toPhone: string, durationMs: number): Promise<void> {
  // Meta WhatsApp Cloud API ainda não tem typing indicator pra fora.
  // Mantém função pra trocar fácil quando disponível ou pra usar provider que suporte.
  // Por ora, só faz sleep.
  await new Promise((r) => setTimeout(r, durationMs));
}

export async function sendMediaUpload(_toPhone: string, _mediaUrl: string): Promise<void> {
  // TODO: implementar quando começar a mandar fotos do portfolio.
}

/**
 * Verifica assinatura do webhook (HMAC-SHA256). Meta manda em x-hub-signature-256.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const appSecret = process.env.META_WHATSAPP_TOKEN; // app secret, na prática separado
  if (!appSecret) return false;

  const expected = signatureHeader.replace("sha256=", "");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === expected;
}
