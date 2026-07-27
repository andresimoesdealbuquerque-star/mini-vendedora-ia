"use client";

import { useEffect, useState } from "react";

interface Avaliacao {
  id: string;
  conversas_analisadas: number;
  desde: string | null;
  ate: string | null;
  score_geral: number;
  score_tempo_resposta: number;
  score_completude: number;
  score_tom: number;
  score_conversao: number;
  resumo_executivo: string;
  pontos_fortes: string[];
  pontos_fracos: string[];
  exemplos: Array<{ cliente: string | null; problema: string; sugestao_de_como_deveria_ter_sido: string }>;
  sugestoes_treinamento: string[];
  criada_em: string;
}

interface VendedorComAvaliacao {
  vendedor: { clint_id: string; nome: string; email: string | null };
  mensagens_no_cache: number;
  avaliacao: Avaliacao | null;
}

export function AbaAvaliar() {
  const [vendedores, setVendedores] = useState<VendedorComAvaliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [analisando, setAnalisando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const r = await fetch("/api/admin/avaliacoes");
    const d = await r.json();
    // Filtra Suporte/André (não são vendedoras de fato)
    const visiveis = (d.vendedores ?? []).filter((v: VendedorComAvaliacao) => {
      const e = v.vendedor.email?.toLowerCase() ?? "";
      if (e.includes("suporte")) return false;
      if (e.includes("andresimoes")) return false;
      return true;
    });
    setVendedores(visiveis);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function sincronizarUsers() {
    setSyncing(true);
    setMsg(null);
    const r = await fetch("/api/admin/clint/sync-usuarios", { method: "POST" });
    const d = await r.json();
    setSyncing(false);
    setMsg(d.ok ? `Sincronizado: ${d.usuarios?.length ?? 0} usuários do Clint` : `Erro: ${d.erro}`);
    setTimeout(() => setMsg(null), 5000);
    await carregar();
  }

  async function analisar(vendedorId: string, nome: string) {
    setAnalisando(vendedorId);
    setMsg(null);
    const r = await fetch("/api/admin/avaliar-vendedor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedor_clint_id: vendedorId, max_conversas: 50 }),
    });
    const d = await r.json();
    setAnalisando(null);
    if (!r.ok) {
      setMsg(`Erro ao avaliar ${nome}: ${d.erro}`);
    } else {
      setMsg(`✓ ${nome} avaliada (${d.avaliacao.conversas_analisadas} conversas)`);
      await carregar();
    }
    setTimeout(() => setMsg(null), 6000);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={sincronizarUsers} disabled={syncing} style={btnSec}>
          {syncing ? "sincronizando…" : "↻ Atualizar lista de vendedoras"}
        </button>
        <p style={{ color: "#666", fontSize: 12, margin: 0 }}>
          A Mila analisa as últimas 50 conversas atendidas por cada vendedora e gera um scorecard.
        </p>
      </div>

      {msg && <div style={msgBox}>{msg}</div>}

      {loading ? (
        <p style={{ color: "#888" }}>carregando…</p>
      ) : vendedores.length === 0 ? (
        <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", marginTop: 24 }}>
          Nenhuma vendedora cadastrada. Clica em "Atualizar lista" pra puxar do Clint.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16 }}>
          {vendedores.map((v) => (
            <CardVendedora
              key={v.vendedor.clint_id}
              dados={v}
              analisando={analisando === v.vendedor.clint_id}
              onAnalisar={() => analisar(v.vendedor.clint_id, v.vendedor.nome)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CardVendedora({ dados, analisando, onAnalisar }: {
  dados: VendedorComAvaliacao;
  analisando: boolean;
  onAnalisar: () => void;
}) {
  const { vendedor, mensagens_no_cache, avaliacao } = dados;
  const [expandido, setExpandido] = useState(false);

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{vendedor.nome}</div>
          <div style={{ fontSize: 11, color: "#888" }}>
            {vendedor.email ?? ""} · {mensagens_no_cache} msgs no cache
          </div>
        </div>
        {avaliacao ? (
          <div style={{ textAlign: "right" }}>
            <div style={scoreBig(avaliacao.score_geral)}>{avaliacao.score_geral.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: "#999" }}>score geral</div>
          </div>
        ) : null}
      </div>

      {!avaliacao ? (
        <div style={{ marginTop: 12 }}>
          <button onClick={onAnalisar} disabled={analisando || mensagens_no_cache === 0} style={btnPrim}>
            {analisando ? "🧠 Mila avaliando…" : "🧠 Avaliar atendimento"}
          </button>
          {mensagens_no_cache === 0 && (
            <p style={{ fontSize: 11, color: "#a00", marginTop: 6 }}>
              Sem mensagens dessa vendedora no cache — rode "Sincronizar" na aba Recuperar antes.
            </p>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 12, fontSize: 13, color: "#444", lineHeight: 1.5 }}>
            {avaliacao.resumo_executivo}
          </div>

          <div style={scoresGrid}>
            <Score label="tempo resp." valor={avaliacao.score_tempo_resposta} />
            <Score label="completude" valor={avaliacao.score_completude} />
            <Score label="tom" valor={avaliacao.score_tom} />
            <Score label="conversão" valor={avaliacao.score_conversao} />
          </div>

          {avaliacao.pontos_fortes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={lblTitle}>✓ pontos fortes</div>
              <ul style={ul}>{avaliacao.pontos_fortes.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}

          {avaliacao.pontos_fracos.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...lblTitle, color: "#c50" }}>✗ pontos fracos</div>
              <ul style={ul}>{avaliacao.pontos_fracos.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}

          <button
            onClick={() => setExpandido(!expandido)}
            style={{ ...btnGhost, marginTop: 8 }}
          >
            {expandido ? "− ocultar exemplos e treinamento" : "+ ver exemplos e plano de treinamento"}
          </button>

          {expandido && (
            <>
              {avaliacao.exemplos.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={lblTitle}>📌 exemplos de melhoria</div>
                  {avaliacao.exemplos.map((ex, i) => (
                    <div key={i} style={exemploCx}>
                      {ex.cliente && <div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>cliente: {ex.cliente}</div>}
                      <div style={{ fontSize: 12, color: "#666" }}>{ex.problema}</div>
                      <div style={{ marginTop: 4, padding: "6px 8px", background: "#dcf8c6", borderRadius: 6, fontSize: 12 }}>
                        💡 {ex.sugestao_de_como_deveria_ter_sido}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {avaliacao.sugestoes_treinamento.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={lblTitle}>🎯 plano de treinamento</div>
                  <ul style={ul}>{avaliacao.sugestoes_treinamento.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: 12, fontSize: 10, color: "#aaa" }}>
            avaliação de {new Date(avaliacao.criada_em).toLocaleString("pt-BR")} · {avaliacao.conversas_analisadas} conversas
          </div>
          <button onClick={onAnalisar} disabled={analisando} style={{ ...btnGhost, marginTop: 4 }}>
            {analisando ? "reavaliando…" : "↻ reavaliar"}
          </button>
        </>
      )}
    </div>
  );
}

function Score({ label, valor }: { label: string; valor: number }) {
  return (
    <div style={scoreBox}>
      <div style={scoreSm(valor)}>{valor.toFixed(1)}</div>
      <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function scoreBig(v: number): React.CSSProperties {
  return {
    fontSize: 32, fontWeight: 800, color: corPorScore(v), lineHeight: 1,
  };
}
function scoreSm(v: number): React.CSSProperties {
  return {
    fontSize: 18, fontWeight: 700, color: corPorScore(v), lineHeight: 1,
  };
}
function corPorScore(v: number): string {
  if (v >= 8) return "#0a7";
  if (v >= 6) return "#a90";
  if (v >= 4) return "#c50";
  return "#a00";
}

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, padding: 16,
};
const scoresGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12, padding: 10,
  background: "#fafafa", borderRadius: 8,
};
const scoreBox: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
};
const exemploCx: React.CSSProperties = {
  background: "#fafafa", border: "1px solid #eee", borderRadius: 8, padding: 8, marginTop: 6,
};
const lblTitle: React.CSSProperties = {
  fontSize: 10, color: "#0a7", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4,
};
const ul: React.CSSProperties = { margin: "0 0 0 18px", padding: 0, fontSize: 12, color: "#555", lineHeight: 1.5 };
const btnPrim: React.CSSProperties = {
  background: "#111", color: "#fff", border: "none", padding: "8px 14px",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnSec: React.CSSProperties = {
  background: "#fff", color: "#333", border: "1px solid #ddd",
  padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "transparent", color: "#666", border: "none",
  padding: "4px 8px", fontSize: 12, cursor: "pointer", textDecoration: "underline",
};
const msgBox: React.CSSProperties = {
  background: "#fef9c3", border: "1px solid #fde68a", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12,
};
