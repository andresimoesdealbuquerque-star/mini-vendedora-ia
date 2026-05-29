import { supabase } from "@/lib/db/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConversaPage({ params }: { params: { id: string } }) {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", params.id).single();
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("lead_id", params.id)
    .order("created_at", { ascending: true });
  const { data: orcamentos } = await supabase
    .from("orcamentos")
    .select("*")
    .eq("lead_id", params.id)
    .order("created_at", { ascending: false });

  if (!lead) return <main style={{ padding: 24 }}>Lead não encontrado</main>;

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <Link href="/admin">← voltar</Link>

      <h1 style={{ marginTop: 16 }}>{lead.nome ?? "(sem nome)"}</h1>
      <p style={{ color: "#666" }}>{lead.phone}</p>

      <section style={{ background: "#f7f7f7", padding: 16, borderRadius: 8, margin: "16px 0" }}>
        <strong>Ficha</strong>
        <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>Modelo de interesse: {lead.modelo_interesse ?? "—"}</li>
          <li>Cor preferida: {lead.cor_preferida ?? "—"}</li>
          <li>Faixa: {lead.faixa_orcamento ?? "—"}</li>
          <li>Prazo desejado: {lead.prazo_desejado ?? "—"}</li>
          <li>Região: {lead.regiao ?? "—"}</li>
          <li>Origem: {lead.origem ?? "—"}</li>
          <li>Etapa: <strong>{lead.etapa}</strong></li>
        </ul>
        {lead.observacoes && <p style={{ marginTop: 12 }}>📝 {lead.observacoes}</p>}
      </section>

      {orcamentos && orcamentos.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <strong>Orçamentos</strong>
          <ul>
            {orcamentos.map((o: any) => (
              <li key={o.id}>
                R$ {o.valor_referencia.toLocaleString("pt-BR")} — {o.detalhamento} ({o.status})
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <strong>Conversa</strong>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {(messages ?? []).map((m: any) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                background: m.role === "user" ? "#e8e8e8" : "#dcf8c6",
                padding: "8px 12px",
                borderRadius: 8,
                maxWidth: "75%",
                whiteSpace: "pre-wrap",
              }}
            >
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                {m.role === "user" ? "Cliente" : "Mila"} ·{" "}
                {new Date(m.created_at).toLocaleString("pt-BR")}
              </div>
              {m.content}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
