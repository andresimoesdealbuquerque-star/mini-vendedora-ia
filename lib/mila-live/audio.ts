/**
 * Transcrição de áudio via Groq Whisper Large v3 Turbo.
 *
 * WhatsApp envia áudio como OGG Opus. Groq aceita direto.
 * Free tier: 14.400 req/dia, ~1s pra transcrever 30s de áudio.
 *
 * Pega chave em console.groq.com/keys → set GROQ_API_KEY no Vercel.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODELO = "whisper-large-v3-turbo";
const IDIOMA = "pt";
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (limite Whisper)

export interface ResultadoTranscricao {
  ok: boolean;
  texto?: string;
  erro?: string;
  duracao_ms?: number;
}

export async function transcreverAudio(url: string): Promise<ResultadoTranscricao> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, erro: "GROQ_API_KEY não configurada" };

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // 1. Baixa o áudio
    const audioResp = await fetch(url, { signal: controller.signal });
    if (!audioResp.ok) return { ok: false, erro: `download ${audioResp.status}` };

    const contentLength = Number(audioResp.headers.get("content-length") || 0);
    if (contentLength > MAX_BYTES) return { ok: false, erro: `áudio muito grande (${Math.round(contentLength / 1_048_576)}MB, max 25MB)` };

    const buffer = await audioResp.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return { ok: false, erro: `áudio muito grande (${Math.round(buffer.byteLength / 1_048_576)}MB, max 25MB)` };

    // 2. Manda pra Groq
    const contentType = audioResp.headers.get("content-type") || "audio/ogg";
    const nomeArquivo = urlParaNome(url, contentType);
    const blob = new Blob([buffer], { type: contentType });

    const form = new FormData();
    form.append("file", blob, nomeArquivo);
    form.append("model", MODELO);
    form.append("language", IDIOMA);
    form.append("response_format", "text");
    form.append("temperature", "0");

    const resp = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { ok: false, erro: `groq ${resp.status}: ${err.slice(0, 200)}` };
    }

    const texto = (await resp.text()).trim();
    return { ok: true, texto, duracao_ms: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) return { ok: false, erro: `timeout ${TIMEOUT_MS}ms` };
    return { ok: false, erro: msg };
  } finally {
    clearTimeout(timer);
  }
}

function urlParaNome(url: string, contentType: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop() || "audio";
    if (base.includes(".")) return base;
  } catch {}
  // fallback pela extensão do content-type
  if (contentType.includes("mp3") || contentType.includes("mpeg")) return "audio.mp3";
  if (contentType.includes("wav")) return "audio.wav";
  if (contentType.includes("m4a") || contentType.includes("mp4")) return "audio.m4a";
  return "audio.ogg";
}
