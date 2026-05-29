/**
 * Auth simples por senha compartilhada — funciona em Edge runtime (middleware).
 *
 * Cookie `mila_auth` recebe o HMAC-SHA256 de "ok" assinado com a senha
 * `ADMIN_PASSWORD`. O middleware compara cookie ao HMAC esperado.
 *
 * Se a senha mudar, todos os cookies anteriores ficam inválidos automaticamente.
 */

const enc = new TextEncoder();

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function tokenEsperado(): Promise<string | null> {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha || senha.length < 6) return null;
  return hmacHex(senha, "ok");
}

export const COOKIE_NAME = "mila_auth";
