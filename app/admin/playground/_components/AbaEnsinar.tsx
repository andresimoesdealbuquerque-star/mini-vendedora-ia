"use client";

import { useEffect, useState } from "react";

interface Regra {
  id: string;
  texto: string;
  ativa: boolean;
  ordem: number;
  criada_em: string;
  atualizada_em: string;
}
interface Exemplo {
  id: string;
  mensagem_cliente: string;
  resposta_correta: string;
  contexto?: string | null;
  ativa: boolean;
  ordem: number;
  origem: "manual" | "playground_correcao";
  criada_em: string;
  atualizada_em: string;
}

export function AbaEnsinar() {
  const [tab, setTab] = useState<"regras" | "exemplos">("regras");
  const [regras, setRegras] = useState<Regra[]>([]);
  const [exemplos, setExemplos] = useState<Exemplo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function recarregar() {
    setErr(null);
    try {
      const r = await fetch("/api/admin/conhecimento");
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro ?? "erro");
      setRegras(d.regras ?? []);
      setExemplos(d.exemplos ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { recarregar(); }, []);

  return (
    <>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <button onClick={() => setTab("regras")} style={subTabStyle(tab === "regras")}>
          Regras <span style={{ color: "#999" }}>({regras.filter(r => r.ativa).length}/{regras.length})</span>
        </button>
        <button onClick={() => setTab("exemplos")} style={subTabStyle(tab === "exemplos")}>
          Exemplos <span style={{ color: "#999" }}>({exemplos.filter(e => e.ativa).length}/{exemplos.length})</span>
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>carregando…</p>}
      {err && <p style={{ color: "#a00" }}>erro: {err}</p>}

      {tab === "regras" && <PainelRegras regras={regras} reload={recarregar} />}
      {tab === "exemplos" && <PainelExemplos exemplos={exemplos} reload={recarregar} />}
    </>
  );
}

function PainelRegras({ regras, reload }: { regras: Regra[]; reload: () => Promise<void> }) {
  const [novoTexto, setNovoTexto] = useState("");
  const [busy, setBusy] = useState(false);

  async function criar() {
    const t = novoTexto.trim();
    if (!t) return;
    setBusy(true);
    await fetch("/api/admin/conhecimento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "regra", texto: t }),
    });
    setNovoTexto("");
    await reload();
    setBusy(false);
  }
  async function toggle(r: Regra) {
    await fetch(`/api/admin/conhecimento/${r.id}?tipo=regra`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: !r.ativa }),
    });
    await reload();
  }
  async function editar(r: Regra) {
    const novo = prompt("Editar regra:", r.texto);
    if (novo === null || novo.trim() === r.texto) return;
    await fetch(`/api/admin/conhecimento/${r.id}?tipo=regra`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: novo.trim() }),
    });
    await reload();
  }
  async function deletar(r: Regra) {
    if (!confirm("Deletar essa regra?")) return;
    await fetch(`/api/admin/conhecimento/${r.id}?tipo=regra`, { method: "DELETE" });
    await reload();
  }

  return (
    <>
      <div style={card}>
        <p style={{ margin: 0, fontSize: 13, color: "#666", marginBottom: 8 }}>
          Escreva uma regra em português natural. Ex: <em>"Nunca prometa entrega em menos de 17 dias úteis."</em>
        </p>
        <textarea
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          placeholder="Quando o cliente…"
          rows={3}
          style={txt}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={criar} disabled={busy || !novoTexto.trim()} style={btnPrim}>
            adicionar regra
          </button>
        </div>
      </div>

      {regras.length === 0 ? (
        <p style={{ color: "#aaa", textAlign: "center", fontSize: 13, marginTop: 24 }}>
          Nenhuma regra cadastrada ainda.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {regras.map((r) => (
            <div key={r.id} style={{ ...row, opacity: r.ativa ? 1 : 0.5 }}>
              <input type="checkbox" checked={r.ativa} onChange={() => toggle(r)} title={r.ativa ? "ativa" : "desativada"} />
              <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{r.texto}</div>
              <button onClick={() => editar(r)} style={btnIcon} title="editar">✎</button>
              <button onClick={() => deletar(r)} style={btnIcon} title="deletar">🗑</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PainelExemplos({ exemplos, reload }: { exemplos: Exemplo[]; reload: () => Promise<void> }) {
  const [cliente, setCliente] = useState("");
  const [resposta, setResposta] = useState("");
  const [contexto, setContexto] = useState("");
  const [busy, setBusy] = useState(false);

  async function criar() {
    if (!cliente.trim() || !resposta.trim()) return;
    setBusy(true);
    await fetch("/api/admin/conhecimento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "exemplo",
        mensagem_cliente: cliente.trim(),
        resposta_correta: resposta.trim(),
        contexto: contexto.trim() || null,
      }),
    });
    setCliente(""); setResposta(""); setContexto("");
    await reload();
    setBusy(false);
  }
  async function toggle(ex: Exemplo) {
    await fetch(`/api/admin/conhecimento/${ex.id}?tipo=exemplo`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: !ex.ativa }),
    });
    await reload();
  }
  async function deletar(ex: Exemplo) {
    if (!confirm("Deletar esse exemplo?")) return;
    await fetch(`/api/admin/conhecimento/${ex.id}?tipo=exemplo`, { method: "DELETE" });
    await reload();
  }

  return (
    <>
      <div style={card}>
        <p style={{ margin: 0, fontSize: 13, color: "#666", marginBottom: 8 }}>
          Crie um par de pergunta/resposta modelo. A Mila usa como exemplo de tom e conduta.
        </p>
        <label style={lbl}>Cliente</label>
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder='ex: "vocês têm garantia?"' style={inp} />
        <label style={lbl}>Mila deve responder</label>
        <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} placeholder="Resposta no tom certo…" rows={4} style={txt} />
        <label style={lbl}>Contexto (opcional)</label>
        <input value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="quando faz sentido usar esse exemplo" style={inp} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={criar} disabled={busy || !cliente.trim() || !resposta.trim()} style={btnPrim}>
            adicionar exemplo
          </button>
        </div>
      </div>

      {exemplos.length === 0 ? (
        <p style={{ color: "#aaa", textAlign: "center", fontSize: 13, marginTop: 24 }}>
          Nenhum exemplo cadastrado ainda.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {exemplos.map((ex) => (
            <div key={ex.id} style={{ ...row, alignItems: "flex-start", opacity: ex.ativa ? 1 : 0.5 }}>
              <input type="checkbox" checked={ex.ativa} onChange={() => toggle(ex)} style={{ marginTop: 4 }} />
              <div style={{ flex: 1, fontSize: 13 }}>
                {ex.contexto && (
                  <div style={{ color: "#888", fontSize: 11, fontStyle: "italic", marginBottom: 4 }}>
                    contexto: {ex.contexto}
                  </div>
                )}
                <div style={{ background: "#e8e8e8", padding: "6px 10px", borderRadius: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 10, color: "#666" }}>Cliente:</strong> {ex.mensagem_cliente}
                </div>
                <div style={{ background: "#dcf8c6", padding: "6px 10px", borderRadius: 8, whiteSpace: "pre-wrap" }}>
                  <strong style={{ fontSize: 10, color: "#666" }}>Mila:</strong> {ex.resposta_correta}
                </div>
                {ex.origem === "playground_correcao" && (
                  <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
                    📝 criado por correção no playground
                  </div>
                )}
              </div>
              <button onClick={() => deletar(ex)} style={btnIcon} title="deletar">🗑</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function subTabStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#333",
    border: "1px solid #ddd",
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  };
}

const card: React.CSSProperties = {
  background: "#fafafa",
  border: "1px solid #eee",
  padding: 14,
  borderRadius: 10,
  marginBottom: 16,
};
const row: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: 10,
  border: "1px solid #eee",
  borderRadius: 8,
  background: "#fff",
};
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "#666", marginTop: 8, marginBottom: 4 };
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #ddd",
  borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};
const txt: React.CSSProperties = { ...inp, resize: "vertical" };
const btnPrim: React.CSSProperties = {
  background: "#111", color: "#fff", border: "none", padding: "8px 14px",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnIcon: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer", fontSize: 14, padding: 4, color: "#666",
};
