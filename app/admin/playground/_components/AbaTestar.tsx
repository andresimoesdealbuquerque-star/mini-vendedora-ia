"use client";

import { useEffect, useRef, useState } from "react";
import { ModalCorrecao } from "./ModalCorrecao";

interface Msg {
  role: "user" | "assistant";
  content: string;
  fragments?: string[];
  visibleFragments?: number;
  midias?: string[];
  trace?: { tool: string; input: unknown; output: unknown }[];
  tokens?: { input: number; output: number; cache_read: number; cache_creation: number };
  routing?: { model: string; intent: string };
}

const CHARS_POR_SEGUNDO = 35;
const MIN_DELAY = 800;
const MAX_DELAY = 4500;
const PAUSA_ENTRE_FRAGMENTS = 350;

function delayPara(fragment: string): number {
  const base = (fragment.length / CHARS_POR_SEGUNDO) * 1000;
  const jitter = Math.random() * 500 - 250;
  return Math.max(MIN_DELAY, Math.min(MAX_DELAY, base + jitter));
}

const STORAGE_KEY = "mila_playground_history";

export function AbaTestar() {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [correcaoOpen, setCorrecaoOpen] = useState<{ idx: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    setHistory((h) => [...h, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: history.map((m) => ({ role: m.role, content: m.content })),
          message: userMsg.content,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro");

      const fragments: string[] = data.fragments ?? [data.reply];
      const midias: string[] = (data.trace ?? [])
        .filter((t: any) => t.tool === "enviar_midia" && t.output?.ok && t.output?.url)
        .map((t: any) => t.output.url);
      const msgIndex = history.length + 1;
      setHistory((h) => [
        ...h,
        {
          role: "assistant",
          content: data.reply,
          fragments,
          visibleFragments: 0,
          midias,
          trace: data.trace,
          tokens: data.tokens,
          routing: data.routing,
        },
      ]);
      setLoading(false);

      for (let i = 0; i < fragments.length; i++) {
        setTyping(true);
        await new Promise((r) => setTimeout(r, delayPara(fragments[i])));
        setTyping(false);
        setHistory((h) => h.map((m, idx) => idx === msgIndex ? { ...m, visibleFragments: i + 1 } : m));
        if (i < fragments.length - 1) {
          await new Promise((r) => setTimeout(r, PAUSA_ENTRE_FRAGMENTS));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
      setLoading(false);
    }
  }

  function reset() {
    setHistory([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  // Mensagem anterior à resposta da Mila no índice idx
  function mensagemClienteAntes(idx: number): string {
    for (let i = idx - 1; i >= 0; i--) {
      if (history[i]?.role === "user") return history[i].content;
    }
    return "";
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <label style={{ fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showTrace} onChange={(e) => setShowTrace(e.target.checked)} />
          mostrar tools
        </label>
        <button onClick={reset} style={btnSecondary}>limpar conversa</button>
      </div>

      <div
        ref={scrollRef}
        style={{
          height: "62vh",
          overflowY: "auto",
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          background: "#f7f7f7",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {history.length === 0 && (
          <div style={{ color: "#aaa", textAlign: "center", marginTop: 40, fontSize: 14 }}>
            Mande uma mensagem como se fosse cliente. Ex: "oi, queria um rack pra sala"
          </div>
        )}

        {history.map((m, i) => {
          const fragmentsToShow =
            m.role === "assistant" && m.fragments
              ? m.fragments.slice(0, m.visibleFragments ?? m.fragments.length)
              : [m.content];
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {m.role === "assistant" && m.midias && m.midias.map((url, mi) => (
                <img
                  key={"img-" + mi}
                  src={url}
                  alt="arte da Mila"
                  style={{ alignSelf: "flex-end", maxWidth: "62%", borderRadius: 12, marginLeft: "auto" }}
                />
              ))}
              {fragmentsToShow.map((frag, fi) => (
                <div
                  key={fi}
                  style={{
                    alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                    background: m.role === "user" ? "#e8e8e8" : "#dcf8c6",
                    padding: "8px 12px",
                    borderRadius: 12,
                    maxWidth: "78%",
                    whiteSpace: "pre-wrap",
                    marginLeft: m.role === "user" ? 0 : "auto",
                    marginRight: m.role === "user" ? "auto" : 0,
                    fontSize: 14,
                  }}
                >
                  {fi === 0 && (
                    <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>
                      {m.role === "user" ? "Cliente" : "Mila"}
                    </div>
                  )}
                  {frag}
                </div>
              ))}

              {/* Botão "corrigir" — só pra respostas da Mila */}
              {m.role === "assistant" && m.visibleFragments === m.fragments?.length && (
                <button
                  onClick={() => setCorrecaoOpen({ idx: i })}
                  style={{
                    alignSelf: "flex-end",
                    background: "transparent",
                    border: "none",
                    color: "#999",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: "0 4px",
                    textDecoration: "underline",
                  }}
                  title="Marcar como errada e ensinar a resposta certa"
                >
                  ✗ corrigir resposta
                </button>
              )}

              {showTrace && m.trace && m.trace.length > 0 && (
                <details style={{ fontSize: 11, color: "#666", margin: "4px 0 0 auto", maxWidth: "78%" }}>
                  <summary>tools chamadas ({m.trace.length})</summary>
                  {m.trace.map((t, j) => (
                    <div key={j} style={{ background: "#fff", padding: 6, borderRadius: 6, margin: "4px 0" }}>
                      <strong>{t.tool}</strong>
                      <div>input: <code>{JSON.stringify(t.input)}</code></div>
                      <div>output: <code style={{ wordBreak: "break-all" }}>{JSON.stringify(t.output).slice(0, 400)}</code></div>
                    </div>
                  ))}
                  {m.routing && (
                    <div style={{ marginTop: 4, fontSize: 10, color: "#444" }}>
                      modelo: <strong>{m.routing.model.includes("haiku") ? "Haiku 4.5" : "Sonnet 4.6"}</strong> | intent: {m.routing.intent}
                    </div>
                  )}
                  {m.tokens && (
                    <div style={{ marginTop: 4, fontSize: 10 }}>
                      tokens: in {m.tokens.input} | out {m.tokens.output} | cache_read {m.tokens.cache_read} | cache_creation {m.tokens.cache_creation}
                    </div>
                  )}
                </details>
              )}
            </div>
          );
        })}

        {(loading || typing) && (
          <div style={{ color: "#999", fontSize: 13, fontStyle: "italic", marginLeft: "auto" }}>
            Mila está digitando...
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#fee", color: "#a00", padding: 10, borderRadius: 8, marginTop: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Mensagem do cliente..."
          disabled={loading}
          style={{
            flex: 1,
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={btnPrimary}>
          enviar
        </button>
      </div>

      {correcaoOpen && (
        <ModalCorrecao
          mensagemCliente={mensagemClienteAntes(correcaoOpen.idx)}
          respostaErrada={history[correcaoOpen.idx].content}
          onClose={() => setCorrecaoOpen(null)}
          onSaved={() => setCorrecaoOpen(null)}
        />
      )}
    </>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "#111",
  color: "#fff",
  border: "none",
  padding: "10px 16px",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#fff",
  color: "#333",
  border: "1px solid #ddd",
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
};
