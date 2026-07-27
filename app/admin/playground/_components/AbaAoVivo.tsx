"use client";

import { useEffect, useState } from "react";

interface Config {
  ativa: boolean;
  modo_simulacao: boolean;
  horario: string;
  e_horario_humano: boolean;
}
interface Log {
  id: string;
  chat_clint_id: string;
  contato_nome: string | null;
  mensagem_cliente: string | null;
  mensagem_cliente_em: string | null;
  resposta_mila: string | null;
  resposta_enviada_em: string | null;
  status: string;
  motivo_escalacao: string | null;
  criada_em: string;
}
interface Autorizacao {
  id: string;
  tipo: string;
  contato_nome: string | null;
  contexto: string;
  proposta_mila: string;
  status: string;
  perguntada_em: string;
  timeout_em: string;
  resposta_dono: string | null;
}

export function AbaAoVivo() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [autorizacoes, setAutorizacoes] = useState<Autorizacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function recarregar() {
    const [c, l] = await Promise.all([
      fetch("/api/admin/mila-config").then((r) => r.json()),
      fetch("/api/admin/mila-ao-vivo?limit=100").then((r) => r.json()),
    ]);
    setCfg(c);
    setLogs(l.logs ?? []);
    setAutorizacoes(l.autorizacoes ?? []);
    setCarregando(false);
  }
  useEffect(() => {
    recarregar();
    const i = setInterval(recarregar, 5000);
    return () => clearInterval(i);
  }, []);

  async function toggle(campo: "ativa" | "modo_simulacao", valor: boolean) {
    setSalvando(true);
    await fetch("/api/admin/mila-config", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor }),
    });
    await recarregar();
    setSalvando(false);
  }

  if (carregando) return <p style={{ color: "#888" }}>carregando…</p>;
  if (!cfg) return <p>Erro ao carregar</p>;

  return (
    <>
      {/* Painel de controle */}
      <div style={{ ...card, marginBottom: 16, background: cfg.ativa ? "#f0fdf4" : "#fef2f2",
                    borderColor: cfg.ativa ? "#86efac" : "#fecaca" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {cfg.ativa ? "🟢 MILA ATIVA" : "🔴 MILA DESATIVADA"}
              {cfg.modo_simulacao && cfg.ativa && <span style={{ marginLeft: 8, fontSize: 14, color: "#a90" }}>· 🧪 MODO SIMULAÇÃO (não envia)</span>}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              {cfg.horario}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => toggle("ativa", !cfg.ativa)}
              disabled={salvando}
              style={{
                ...btn,
                background: cfg.ativa ? "#dc2626" : "#16a34a",
                color: "#fff",
                fontSize: 14, padding: "10px 20px", fontWeight: 700,
              }}
            >
              {cfg.ativa ? "⏸ PAUSAR MILA" : "▶ ATIVAR MILA"}
            </button>
            <button
              onClick={() => toggle("modo_simulacao", !cfg.modo_simulacao)}
              disabled={salvando}
              style={{ ...btn, background: "#fff", border: "1px solid #ddd", color: "#333", fontSize: 12 }}
              title="No modo simulação, a Mila gera resposta mas não envia — só registra no log"
            >
              {cfg.modo_simulacao ? "✓ simulação ON" : "○ simulação OFF"}
            </button>
          </div>
        </div>
      </div>

      {/* Autorizações pendentes/recentes */}
      {autorizacoes.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={cardTitle}>🔐 Autorizações</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {autorizacoes.map((a) => (
              <div key={a.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, fontSize: 13,
                                       background: a.status === "aguardando" ? "#fffbeb" : "#fff" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...chip, background: corStatusAutorizacao(a.status), color: "#fff" }}>{a.status}</span>
                  <span style={chip}>{a.tipo}</span>
                  <strong>{a.contato_nome ?? "?"}</strong>
                  <span style={{ color: "#888", fontSize: 11 }}>
                    perguntado {new Date(a.perguntada_em).toLocaleTimeString("pt-BR")}
                    {a.status === "aguardando" && ` · timeout ${new Date(a.timeout_em).toLocaleTimeString("pt-BR")}`}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>{a.contexto}</div>
                <details style={{ marginTop: 4, fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", color: "#0a7" }}>ver proposta da Mila</summary>
                  <div style={{ background: "#dcf8c6", padding: 8, borderRadius: 6, marginTop: 4, whiteSpace: "pre-wrap" }}>
                    {a.proposta_mila}
                  </div>
                </details>
                {a.resposta_dono && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#666" }}>
                    resposta dono: <strong>{a.resposta_dono}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline em tempo real */}
      <div style={card}>
        <div style={cardTitle}>📡 Timeline (atualiza a cada 5s)</div>
        {logs.length === 0 ? (
          <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", marginTop: 20 }}>
            Nada aconteceu ainda. Quando um cliente escrever fora do horário humano, aparecerá aqui.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "65vh", overflow: "auto" }}>
            {logs.map((l) => (
              <div key={l.id} style={{ padding: 10, border: "1px solid #eee", borderRadius: 8,
                                       background: corStatus(l.status).bg, borderLeft: `4px solid ${corStatus(l.status).border}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ ...chip, background: corStatus(l.status).border, color: "#fff" }}>{l.status}</span>
                  <strong style={{ fontSize: 13 }}>{l.contato_nome ?? "?"}</strong>
                  <span style={{ color: "#888", fontSize: 11 }}>
                    {new Date(l.criada_em).toLocaleString("pt-BR")}
                  </span>
                </div>
                {l.mensagem_cliente && (
                  <div style={{ background: "#e8e8e8", padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Cliente:</div>
                    {l.mensagem_cliente}
                  </div>
                )}
                {l.resposta_mila && (
                  <div style={{ background: "#dcf8c6", padding: 8, borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Mila:</div>
                    {l.resposta_mila}
                  </div>
                )}
                {l.motivo_escalacao && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#c50" }}>
                    ⚠ {l.motivo_escalacao}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function corStatus(s: string) {
  switch (s) {
    case "enviada": return { bg: "#f0fdf4", border: "#16a34a" };
    case "simulada": return { bg: "#fef9c3", border: "#a16207" };
    case "aguardando_autorizacao": return { bg: "#fffbeb", border: "#f59e0b" };
    case "escalada": return { bg: "#fef2f2", border: "#dc2626" };
    case "falhou": return { bg: "#fef2f2", border: "#dc2626" };
    default: return { bg: "#fff", border: "#ddd" };
  }
}
function corStatusAutorizacao(s: string): string {
  switch (s) {
    case "aguardando": return "#f59e0b";
    case "aprovada": return "#16a34a";
    case "negada": return "#dc2626";
    case "timeout": return "#6b7280";
    default: return "#9ca3af";
  }
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 };
const cardTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 12,
  textTransform: "uppercase", letterSpacing: 0.5,
};
const btn: React.CSSProperties = {
  border: "none", borderRadius: 8, padding: "8px 14px",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const chip: React.CSSProperties = {
  fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "#eee",
  color: "#333", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5,
};
