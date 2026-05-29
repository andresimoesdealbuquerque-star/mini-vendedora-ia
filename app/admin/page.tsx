import Link from "next/link";
import { supabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let leads: any[] | null = null;
  let dbError: string | null = null;
  try {
    const r = await supabase
      .from("leads_resumo")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(100);
    leads = r.data;
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Supabase indisponível.";
  }

  const counts = (leads ?? []).reduce<Record<string, number>>((acc, l) => {
    const k = l.etapa ?? "indefinido";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Mini Marcenaria — Vendedora IA</h1>
      <p style={{ color: "#666", marginBottom: 12 }}>
        Dashboard de leads. {leads?.length ?? 0} leads recentes.{" "}
        <Link href="/admin/playground" style={{ marginLeft: 12 }}>→ ir pro Playground (testar a Mila)</Link>
      </p>
      {dbError && (
        <div style={{ background: "#fff3cd", border: "1px solid #ffe08a", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Supabase ainda não configurado — dashboard vazio. Use o <Link href="/admin/playground">Playground</Link> pra testar a Mila com só ANTHROPIC_API_KEY.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {Object.entries(counts).map(([etapa, n]) => (
          <span
            key={etapa}
            style={{
              background: "#f0f0f0",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {etapa}: <strong>{n}</strong>
          </span>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Nome</th>
            <th style={{ padding: 8 }}>Telefone</th>
            <th style={{ padding: 8 }}>Modelo</th>
            <th style={{ padding: 8 }}>Etapa</th>
            <th style={{ padding: 8 }}>Última msg</th>
            <th style={{ padding: 8 }}>Orçamento</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {(leads ?? []).map((l: any) => (
            <tr key={l.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>
                {l.nome ?? "—"}
                {l.handed_off_at && !l.handed_back_at && (
                  <span style={{ marginLeft: 6, fontSize: 12, color: "#c60" }}>(humano)</span>
                )}
              </td>
              <td style={{ padding: 8, fontFamily: "monospace", fontSize: 13 }}>{l.phone}</td>
              <td style={{ padding: 8 }}>{l.modelo_interesse ?? "—"}</td>
              <td style={{ padding: 8 }}>{l.etapa}</td>
              <td style={{ padding: 8, fontSize: 13, color: "#666" }}>
                {l.last_message_at ? new Date(l.last_message_at).toLocaleString("pt-BR") : "—"}
              </td>
              <td style={{ padding: 8 }}>
                {l.ultimo_valor_orcado ? `R$ ${l.ultimo_valor_orcado.toLocaleString("pt-BR")}` : "—"}
              </td>
              <td style={{ padding: 8 }}>
                <Link href={`/admin/${l.id}`}>ver →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
