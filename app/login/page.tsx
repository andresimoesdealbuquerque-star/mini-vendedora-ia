"use client";

import { useState } from "react";

export default function Login() {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function entrar() {
    if (!pwd) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/login", { method: "POST", body: pwd });
      if (r.ok) {
        const from = new URLSearchParams(window.location.search).get("from");
        window.location.href = from || "/admin/playground";
      } else {
        const d = await r.json().catch(() => ({}));
        setErr(d.erro ?? "senha incorreta");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "system-ui",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#111",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 16,
          maxWidth: 380,
          width: "100%",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Mila</h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 13 }}>
            Painel de treino — Mini Marcenaria
          </p>
        </div>

        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          placeholder="senha"
          autoFocus
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            borderRadius: 8,
            border: "1px solid #ddd",
            boxSizing: "border-box",
          }}
        />

        <button
          onClick={entrar}
          disabled={busy || !pwd}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 24px",
            background: busy || !pwd ? "#999" : "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: busy || !pwd ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {busy ? "entrando…" : "Entrar"}
        </button>

        {err && (
          <p style={{ color: "#a00", fontSize: 13, marginTop: 12, textAlign: "center" }}>
            {err}
          </p>
        )}
      </div>
    </main>
  );
}
