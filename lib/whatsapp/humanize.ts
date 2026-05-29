/**
 * Camada de humanização do envio. Em vez de despejar uma resposta gigante de
 * uma vez, fragmenta em mensagens curtas com delay proporcional ao tamanho —
 * imitando o ritmo de digitação de uma pessoa.
 *
 * A IA já gera resposta com "\n\n" entre fragmentos quando faz sentido. Quando
 * não, a gente quebra automaticamente em frases.
 */

import { sendText, sendTypingIndicator } from "./meta";

const CHARS_POR_SEGUNDO = 35; // velocidade de digitação humana
const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 4500;
const JITTER_MS = 600;

export async function sendHumanizedReply(toPhone: string, fullText: string): Promise<void> {
  const fragments = splitIntoFragments(fullText);

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    const delayMs = computeDelay(frag);
    await sendTypingIndicator(toPhone, delayMs);
    await sendText(toPhone, frag);

    // Pausa curta entre mensagens consecutivas (não a primeira).
    if (i < fragments.length - 1) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
    }
  }
}

function splitIntoFragments(text: string): string[] {
  // Primeiro: respeitar quebras "\n\n" que a IA já fez.
  const explicit = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (explicit.length > 1) return explicit;

  // Se veio um bloco só, quebrar em frases curtas (até ~140 chars cada).
  const sentences = text
    .replace(/\n/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const fragments: string[] = [];
  let buffer = "";

  for (const s of sentences) {
    if ((buffer + " " + s).trim().length > 140 && buffer) {
      fragments.push(buffer.trim());
      buffer = s;
    } else {
      buffer = buffer ? `${buffer} ${s}` : s;
    }
  }
  if (buffer) fragments.push(buffer.trim());

  return fragments.length ? fragments : [text];
}

function computeDelay(fragment: string): number {
  const baseMs = (fragment.length / CHARS_POR_SEGUNDO) * 1000;
  const jitter = Math.random() * JITTER_MS - JITTER_MS / 2;
  return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, baseMs + jitter));
}
