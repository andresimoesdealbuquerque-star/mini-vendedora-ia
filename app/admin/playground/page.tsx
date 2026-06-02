"use client";

import { useState } from "react";
import { AbaTestar } from "./_components/AbaTestar";
import { AbaEnsinar } from "./_components/AbaEnsinar";
import { AbaRecuperar } from "./_components/AbaRecuperar";

type Tab = "testar" | "ensinar" | "recuperar";

export default function Playground() {
  const [tab, setTab] = useState<Tab>("testar");

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Mila — Painel de Treino</h1>
        <p style={{ margin: "4px 0 0", color: "#888", fontSize: 13 }}>
          Teste conversas e ensine regras/exemplos. Tudo que entra aqui vale também em produção (WhatsApp).
        </p>
      </header>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #eee" }}>
        <button onClick={() => setTab("testar")} style={tabStyle(tab === "testar")}>
          💬 Testar
        </button>
        <button onClick={() => setTab("ensinar")} style={tabStyle(tab === "ensinar")}>
          🎓 Ensinar
        </button>
        <button onClick={() => setTab("recuperar")} style={tabStyle(tab === "recuperar")}>
          🔥 Recuperar
        </button>
      </div>

      {tab === "testar" && <AbaTestar />}
      {tab === "ensinar" && <AbaEnsinar />}
      {tab === "recuperar" && <AbaRecuperar />}
    </main>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    background: "transparent",
    color: active ? "#111" : "#888",
    border: "none",
    borderBottom: active ? "2px solid #111" : "2px solid transparent",
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    marginBottom: -1,
  };
}
