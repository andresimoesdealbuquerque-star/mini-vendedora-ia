"use client";

import { useEffect, useState } from "react";

interface Sugestao {
  id: string;
  contato_clint_id: string;
  chat_clint_id: string | null;
  calor: "quente" | "morno" | "frio" | "perdido";
  etapa_parou: string;
  dias_sem_resposta: number;
  diagnostico: string;
  pontos_fortes: string[];
  oportunidades_perdidas: string[];
  texto_sugerido: string;
  midia_sugerida?: string | null;
  status: "pendente" | "aprovada" | "enviada" | "descartada" | "falhou";
  motivo_descarte?: string | null;
  enviada_em?: string | null;
  criada_em: string;
  clint_contatos: {
    clint_id: string;
    nome: string | null;
    telefone: string | null;
    etapa_funil: string | null;
    ultima_mensagem_em: string | null;
  };
}

export function AbaRecuperar() {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [filtro, setFiltro] = useState<"pendente" | "enviada" | "descartada">("pendente");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const r = await fetch(`/api/admin/recuperacao?status=${filtro}`);
    const d = await r.json();
    setSugestoes(d.sugestoes ?? []);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, [filtro]);

  async function sincronizar() {
    setSyncing(true);
    setMsg(null);
    const r = await fetch("/api/admin/clint/sync", { method: "POST" });
    const d = await r.json();
    setSyncing(false);
    setMsg(`Sync ${d.fonte}: ${d.contatos} contatos, ${d.chats} chats, ${d.mensagens} mensagens${d.erros?.length ? ` (${d.erros.length} erros)` : ""}`);
    setTimeout(() => setMsg(null), 5000);
  }

  async function analisar() {
    setAnalyzing(true);
    setMsg(null);
    const r = await fetch("/api/admin/recuperacao/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limite: 10 }),
    });
    const d = await r.json();
    setAnalyzing(false);
    setMsg(`Analisado: ${d.analisados} de ${d.total_contatos} contatos`);
    await carregar();
    setTimeout(() => setMsg(null), 5000);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={sincronizar} disabled={syncing} style={btnSec}>
          {syncing ? "sincronizando…" : "↻ Sincronizar do Clint"}
        </button>
        <button onClick={analisar} disabled={analyzing} style={btnPrim}>
          {analyzing ? "Mila analisando…" : "🧠 Analisar 10 leads frios"}
        </button>
        <div style={{ flex: 1 }} />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} style={selStyle}>
          <option value="pendente">Pendentes</option>
          <option value="enviada">Enviadas</option>
          <option value="descartada">Descartadas</option>
        </select>
      </div>

      {msg && <div style={msgBox}>{msg}</div>}

      {loading ? (
        <p style={{ color: "#888" }}>carregando…</p>
      ) : sugestoes.length === 0 ? (
        <div style={{ color: "#aaa", textAlign: "center", fontSize: 14, marginTop: 24 }}>
          {filtro === "pendente"
            ? "Nenhuma sugestão pendente. Clica em Sincronizar e depois em Analisar pra Mila gerar sugestões."
            : "Nenhuma nessa lista ainda."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sugestoes.map((s) => (
            <CardSugestao key={s.id} sugestao={s} onMutate={carregar} />
          ))}
        </div>
      )}
    </>
  );
}

function CardSugestao({ sugestao, onMutate }: { sugestao: Sugestao; onMutate: () => Promise<void> }) {
  const [texto, setTexto] = useState(sugestao.texto_sugerido);
  const [editando, setEditando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [verConversa, setVerConversa] = useState(false);
  const [conversa, setConversa] = useState<any[] | null>(null);

  async function disparar() {
    setEnviando(true);
    setErro(null);
    const r = await fetch(`/api/admin/recuperacao/${sugestao.id}/disparar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    const d = await r.json();
    setEnviando(false);
    if (!r.ok) {
      setErro(d.erro ?? "erro");
      return;
    }
    await onMutate();
  }

  async function descartar() {
    if (!confirm("Descartar essa sugestão?")) return;
    await fetch(`/api/admin/recuperacao/${sugestao.id}`, { method: "DELETE" });
    await onMutate();
  }

  async function salvarTexto() {
    await fetch(`/api/admin/recuperacao/${sugestao.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto_sugerido: texto }),
    });
    setEditando(false);
  }

  async function carregarConversa() {
    if (conversa) { setVerConversa(!verConversa); return; }
    const r = await fetch(`/api/admin/recuperacao/${sugestao.id}/conversa`);
    const d = await r.json();
    setConversa(d.mensagens ?? []);
    setVerConversa(true);
  }

  const cor = corPorCalor(sugestao.calor);

  return (
    <div style={{ ...card, borderLeft: `4px solid ${cor.bg}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>
          {sugestao.clint_contatos?.nome ?? "(sem nome)"}
        </strong>
        <span style={{ fontSize: 11, color: "#888" }}>
          {sugestao.clint_contatos?.telefone ?? ""}
        </span>
        <span style={{ ...chip, background: cor.bg, color: cor.fg }}>{sugestao.calor}</span>
        <span style={chip}>{sugestao.etapa_parou}</span>
        <span style={chipMuted}>{sugestao.dias_sem_resposta}d sem resp.</span>
        <div style={{ flex: 1 }} />
        <button onClick={carregarConversa} style={btnGhost}>
          {verConversa ? "× fechar histórico" : "📖 ver histórico"}
        </button>
      </div>

      <p style={{ margin: "12px 0 4px", fontSize: 13, color: "#555" }}>{sugestao.diagnostico}</p>

      {(sugestao.oportunidades_perdidas?.length > 0 || sugestao.pontos_fortes?.length > 0) && (
        <details style={{ fontSize: 12, color: "#666", margin: "4px 0 8px" }}>
          <summary>análise detalhada</summary>
          {sugestao.pontos_fortes?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <strong style={{ color: "#0a7" }}>✓ pontos fortes</strong>
              <ul style={ul}>{sugestao.pontos_fortes.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          {sugestao.oportunidades_perdidas?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <strong style={{ color: "#c50" }}>✗ oportunidades perdidas</strong>
              <ul style={ul}>{sugestao.oportunidades_perdidas.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
        </details>
      )}

      {verConversa && conversa && (
        <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: 8, padding: 10, fontSize: 12, maxHeight: 200, overflow: "auto", marginBottom: 8 }}>
          {conversa.length === 0 ? (
            <em style={{ color: "#aaa" }}>(sem histórico)</em>
          ) : conversa.map((m, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <strong style={{ color: m.direcao === "entrada" ? "#06c" : "#0a7" }}>
                {m.direcao === "entrada" ? "Cliente" : "Vendedora"}:
              </strong> {m.conteudo}
              <span style={{ color: "#aaa", fontSize: 10, marginLeft: 6 }}>
                {m.enviada_em ? new Date(m.enviada_em).toLocaleString("pt-BR") : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: "#dcf8c6", padding: 10, borderRadius: 10, marginTop: 4, position: "relative" }}>
        <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>
          Mensagem sugerida pela Mila {sugestao.midia_sugerida && `(+ arte: ${sugestao.midia_sugerida})`}
        </div>
        {editando ? (
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={Math.max(3, texto.split("\n").length)}
            style={txt}
          />
        ) : (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{texto}</div>
        )}
      </div>

      {erro && <div style={{ color: "#a00", fontSize: 12, marginTop: 6 }}>{erro}</div>}

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {sugestao.status === "pendente" && (
          <>
            {editando ? (
              <button onClick={salvarTexto} style={btnSec}>✓ salvar texto</button>
            ) : (
              <button onClick={() => setEditando(true)} style={btnSec}>✎ editar</button>
            )}
            <button onClick={disparar} disabled={enviando || !texto.trim()} style={btnPrim}>
              {enviando ? "enviando…" : "📤 Enviar via Clint"}
            </button>
            <button onClick={descartar} style={btnGhost}>descartar</button>
          </>
        )}
        {sugestao.status === "enviada" && (
          <span style={{ fontSize: 12, color: "#0a7" }}>
            ✓ enviada em {sugestao.enviada_em ? new Date(sugestao.enviada_em).toLocaleString("pt-BR") : ""}
          </span>
        )}
        {sugestao.status === "descartada" && sugestao.motivo_descarte && (
          <span style={{ fontSize: 12, color: "#888" }}>motivo: {sugestao.motivo_descarte}</span>
        )}
      </div>
    </div>
  );
}

function corPorCalor(c: string) {
  switch (c) {
    case "quente": return { bg: "#ef4444", fg: "#fff" };
    case "morno":  return { bg: "#f59e0b", fg: "#fff" };
    case "frio":   return { bg: "#3b82f6", fg: "#fff" };
    case "perdido":return { bg: "#9ca3af", fg: "#fff" };
    default:       return { bg: "#ddd", fg: "#333" };
  }
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 14,
};
const chip: React.CSSProperties = {
  fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "#eee", color: "#333", textTransform: "uppercase",
  fontWeight: 600, letterSpacing: 0.5,
};
const chipMuted: React.CSSProperties = { ...chip, background: "#f5f5f5", color: "#888", fontWeight: 400 };
const ul: React.CSSProperties = { margin: "4px 0 0 18px", padding: 0 };
const btnPrim: React.CSSProperties = {
  background: "#111", color: "#fff", border: "none", padding: "7px 14px",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnSec: React.CSSProperties = {
  background: "#fff", color: "#333", border: "1px solid #ddd",
  padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "transparent", color: "#666", border: "none",
  padding: "7px 12px", fontSize: 12, cursor: "pointer", textDecoration: "underline",
};
const selStyle: React.CSSProperties = {
  padding: "7px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer",
};
const msgBox: React.CSSProperties = {
  background: "#fef9c3", border: "1px solid #fde68a", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12,
};
const txt: React.CSSProperties = {
  width: "100%", padding: 8, border: "1px solid #c4e3a0", borderRadius: 6, fontSize: 14,
  fontFamily: "inherit", boxSizing: "border-box", background: "#fff", resize: "vertical",
};
