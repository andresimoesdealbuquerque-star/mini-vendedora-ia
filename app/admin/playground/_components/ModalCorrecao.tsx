"use client";

import { useState } from "react";

export function ModalCorrecao({
  mensagemCliente,
  respostaErrada,
  onClose,
  onSaved,
}: {
  mensagemCliente: string;
  respostaErrada: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [respostaCorreta, setRespostaCorreta] = useState("");
  const [contexto, setContexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function salvar() {
    if (!respostaCorreta.trim()) {
      setErr("escreva a resposta correta");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/conhecimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "exemplo",
          mensagem_cliente: mensagemCliente,
          resposta_correta: respostaCorreta.trim(),
          contexto: contexto.trim() || null,
          origem: "playground_correcao",
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.erro ?? "erro");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, padding: 24,
          maxWidth: 600, width: "92%", maxHeight: "85vh", overflow: "auto",
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 4, fontSize: 18 }}>Corrigir resposta da Mila</h2>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>
          Vai virar um exemplo que a Mila usa nas próximas conversas. Idêntico ao playground e WhatsApp.
        </p>

        <label style={lbl}>Mensagem do cliente</label>
        <div style={readBox}>{mensagemCliente || <em style={{ color: "#aaa" }}>(início da conversa)</em>}</div>

        <label style={lbl}>Resposta que a Mila deu (errada)</label>
        <div style={{ ...readBox, color: "#a00", whiteSpace: "pre-wrap" }}>{respostaErrada}</div>

        <label style={lbl}>Resposta que ela DEVERIA ter dado</label>
        <textarea
          value={respostaCorreta}
          onChange={(e) => setRespostaCorreta(e.target.value)}
          placeholder="Escreva como a Mila devia ter respondido…"
          rows={5}
          style={txt}
        />

        <label style={lbl}>Contexto (opcional)</label>
        <input
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          placeholder='ex: "cliente perguntando sobre prazo"'
          style={inp}
        />

        {err && <div style={{ color: "#a00", fontSize: 13, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnSec}>cancelar</button>
          <button onClick={salvar} disabled={saving} style={btnPrim}>
            {saving ? "salvando…" : "salvar exemplo"}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "#666", marginTop: 12, marginBottom: 4 };
const readBox: React.CSSProperties = {
  background: "#f5f5f5", padding: "8px 12px", borderRadius: 8, fontSize: 13,
  border: "1px solid #eee", color: "#333",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontFamily: "inherit",
};
const txt: React.CSSProperties = { ...inp, resize: "vertical" };
const btnPrim: React.CSSProperties = {
  background: "#111", color: "#fff", border: "none", padding: "9px 16px",
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const btnSec: React.CSSProperties = {
  background: "#fff", color: "#333", border: "1px solid #ddd", padding: "9px 16px",
  borderRadius: 8, fontSize: 14, cursor: "pointer",
};
