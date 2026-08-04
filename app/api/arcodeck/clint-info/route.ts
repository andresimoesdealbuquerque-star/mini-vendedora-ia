import { NextRequest, NextResponse } from "next/server";
import { listarCanais, listarTemplates } from "@/lib/clint/client";

// Rota de conveniência (uso único de setup): lista os canais do Clint e os
// templates do WhatsApp Oficial, pra você copiar o channel_account_id e o
// template_id. Protegida pelo mesmo segredo do webhook.
//   GET /api/arcodeck/clint-info?secret=<ARCODECK_WEBHOOK_SECRET>
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = process.env.ARCODECK_WEBHOOK_SECRET;
  const enviado = req.nextUrl.searchParams.get("secret");
  if (secret && enviado !== secret) {
    return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  const canais = await listarCanais();
  if (!canais.ok) return NextResponse.json({ ok: false, erro: canais.erro }, { status: 502 });

  const lista = (canais.data.data || []).map((c) => ({
    channel_account_id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
  }));

  const oficial = (canais.data.data || []).find(
    (c) => c.type === "WHATSAPP_OFFICIAL" && c.status === "CONNECTED",
  );

  let templates: unknown[] = [];
  if (oficial) {
    const t = await listarTemplates(oficial.id);
    if (t.ok) {
      templates = (t.data.data || []).map((x) => ({
        template_id: x.id,
        name: x.name,
        status: x.status,
        language: x.language,
      }));
    }
  }

  return NextResponse.json({
    ok: true,
    dica: "copie o channel_account_id (WHATSAPP_OFFICIAL) e o template_id de 'arco_novo_negocio' pras envs da Vercel",
    canais: lista,
    canal_oficial: oficial?.id || null,
    templates,
  });
}
