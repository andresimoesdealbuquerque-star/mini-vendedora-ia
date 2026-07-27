"use client";

import { useEffect, useState } from "react";

interface Panorama {
  periodo: { dias: number; desde: string };
  totais: {
    total_analisados: number;
    fechados: number;
    perdidos: number;
    em_andamento: number;
    taxa_fechamento_pct: number;
  };
  motivos_perda: Array<{ motivo: string; count: number; pct: number }>;
  por_vendedora: Array<{
    vendedor: { clint_id: string; nome: string; email: string | null };
    total: number;
    fechados: number;
    perdidos: number;
    em_andamento: number;
    taxa_fechamento_pct: number;
    principal_motivo_perda: string | null;
  }>;
  insights: string[];
}

const MOTIVO_LABEL: Record<string, string> = {
  atendimento_demorado: "Atendimento demorado",
  vendedora_sumiu: "Vendedora sumiu (sem follow-up)",
  erro_comercial: "Erro comercial (desconto/frete/prazo)",
  preco_alto: "Cliente achou preço alto",
  fora_do_escopo: "Fora do escopo (cama, embutido, curva)",
  vou_pensar: "Cliente disse \"vou pensar\" e sumiu",
  foi_pra_concorrencia: "Foi comprar em outro lugar",
  prazo_nao_bateu: "Prazo não bateu",
  sem_motivo_claro: "Sem motivo claro",
  fechado_com_sucesso: "Fechado com sucesso",
  em_andamento: "Em andamento",
};

const MOTIVO_COR: Record<string, string> = {
  atendimento_demorado: "#f59e0b",
  vendedora_sumiu: "#ef4444",
  erro_comercial: "#dc2626",
  preco_alto: "#8b5cf6",
  fora_do_escopo: "#6b7280",
  vou_pensar: "#3b82f6",
  foi_pra_concorrencia: "#ec4899",
  prazo_nao_bateu: "#f97316",
  sem_motivo_claro: "#9ca3af",
};

export function AbaPanorama() {
  const [dados, setDados] = useState<Panorama | null>(null);
  const [dias, setDias] = useState(90);
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const r = await fetch(`/api/admin/panorama?dias=${dias}`);
    const d = await r.json();
    setDados(d.erro ? null : d);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, [dias]);

  async function analisar() {
    setAnalisando(true);
    setMsg("Mila analisando conversas… pode levar alguns minutos.");
    const r = await fetch("/api/admin/panorama/analisar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limite: 30 }),
    });
    const d = await r.json();
    setAnalisando(false);
    setMsg(d.ok
      ? `✓ ${d.analisados} conversas novas analisadas (${d.ja_analisados_antes} já estavam)`
      : `Erro: ${d.erro}`);
    setTimeout(() => setMsg(null), 6000);
    await carregar();
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={selStyle}>
          <option value={30}>Últimos 30 dias</option>
          <option value={60}>Últimos 60 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <button onClick={analisar} disabled={analisando} style={btnPrim}>
          {analisando ? "🧠 Mila analisando…" : "🧠 Analisar 30 conversas"}
        </button>
        <div style={{ flex: 1 }} />
        {dados && (
          <div style={{ fontSize: 12, color: "#666" }}>
            {dados.totais.total_analisados} conversas analisadas
          </div>
        )}
      </div>

      {msg && <div style={msgBox}>{msg}</div>}

      {loading ? (
        <p style={{ color: "#888" }}>carregando…</p>
      ) : !dados || dados.totais.total_analisados === 0 ? (
        <div style={{ color: "#aaa", textAlign: "center", fontSize: 14, marginTop: 24 }}>
          Nenhuma conversa analisada ainda. Clique em "Analisar 30 conversas" pra começar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Cards top */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <KpiCard label="Leads no período" valor={dados.totais.total_analisados} />
            <KpiCard label="Fechados" valor={dados.totais.fechados} cor="#0a7" />
            <KpiCard label="Perdidos" valor={dados.totais.perdidos} cor="#c50" />
            <KpiCard label="Taxa fechamento" valor={`${dados.totais.taxa_fechamento_pct}%`} cor="#111" />
          </div>

          {/* Insights */}
          {dados.insights.length > 0 && (
            <div style={{ ...card, background: "#fffbeb", borderColor: "#fde68a" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#a16207", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                🚨 Insights da Mila
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: "#333" }}>
                {dados.insights.map((i, k) => <li key={k}>{i}</li>)}
              </ul>
            </div>
          )}

          {/* Motivos de perda */}
          <div style={card}>
            <div style={cardTitle}>📉 Por que perdeu — {dados.totais.perdidos} leads</div>
            {dados.motivos_perda.length === 0 ? (
              <p style={{ color: "#888", fontSize: 13 }}>Nenhum lead perdido.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dados.motivos_perda.map((m) => (
                  <div key={m.motivo}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                      <span>{MOTIVO_LABEL[m.motivo] ?? m.motivo}</span>
                      <span style={{ color: "#666" }}>{m.count} · {m.pct}%</span>
                    </div>
                    <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{
                        width: `${m.pct}%`,
                        height: "100%",
                        background: MOTIVO_COR[m.motivo] ?? "#9ca3af",
                        transition: "width 0.4s",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Por vendedora */}
          {dados.por_vendedora.some((v) => v.total > 0) && (
            <div style={card}>
              <div style={cardTitle}>🏆 Por vendedora</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                {dados.por_vendedora.map((v) => (
                  <div key={v.vendedor.clint_id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{v.vendedor.nome}</div>
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#666" }}>
                      <div>{v.total} atendimentos</div>
                      <div style={{ color: "#0a7" }}>{v.fechados} fechados</div>
                      <div style={{ color: "#c50" }}>{v.perdidos} perdidos</div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: corTaxa(v.taxa_fechamento_pct) }}>
                      {v.taxa_fechamento_pct}%
                      <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 6 }}>fechamento</span>
                    </div>
                    {v.principal_motivo_perda && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#c50" }}>
                        principal perda: <strong>{MOTIVO_LABEL[v.principal_motivo_perda] ?? v.principal_motivo_perda}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function KpiCard({ label, valor, cor }: { label: string; valor: number | string; cor?: string }) {
  return (
    <div style={{ ...card, textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: cor ?? "#111", lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function corTaxa(v: number): string {
  if (v >= 40) return "#0a7";
  if (v >= 20) return "#a90";
  return "#c50";
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 };
const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 };
const btnPrim: React.CSSProperties = {
  background: "#111", color: "#fff", border: "none", padding: "8px 14px",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const selStyle: React.CSSProperties = {
  padding: "7px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer",
};
const msgBox: React.CSSProperties = {
  background: "#fef9c3", border: "1px solid #fde68a", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12,
};
