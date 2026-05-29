# Mini Marcenaria — Vendedora IA

Atende leads no WhatsApp 24/7 com voz humana, manda preço, promete prazo e negocia desconto dentro de regras pré-definidas.

## Stack

- **Next.js 14** (App Router) — webhook + admin num projeto só
- **Claude API** — Haiku 4.5 (80% das mensagens) + Sonnet 4.6 (negociação/orçamento)
- **Supabase** — leads, conversas, orçamentos
- **Meta Cloud API** — WhatsApp oficial (mais barato e estável que Z-API/Twilio)
- **Vercel** — deploy + cron jobs

## Custo estimado

| Item | Custo/mês (100 leads ativos) |
|------|------------------------------|
| Claude API (com cache) | ~$15-25 |
| Meta WhatsApp API | $0-30 (1ª 1000 conversas/mês grátis) |
| Vercel | $0 (hobby) |
| Supabase | $0 (free tier) |
| **Total** | **~$15-55/mês** |

Comparado a 1 vendedora humana (~R$ 3-5k/mês CLT + comissão), o ROI aparece já na primeira venda.

## Como a IA não parece bot

1. **Persona fixa** — "Mila", consultora da Mini Marcenaria. Tom: paulistana, cordial, direta.
2. **Mensagens fragmentadas** — quebra resposta em 2-4 mensagens curtas, com "digitando..." e delay proporcional.
3. **Memória rica** — lembra do nome, projeto, conversas anteriores, fotos enviadas.
4. **Linguagem natural** — coloquial, sem bullet points, sem "como posso ajudar?".
5. **Iniciativa** — sempre propõe próximo passo (mandar foto, agendar, etc).
6. **Não onisciente** — "deixa eu confirmar com a produção e te volto" pra coisas reais que precisam de humano.
7. **Áudio** — transcreve áudio recebido, responde com texto natural (futuro: TTS).

## Como ela manda preço/prazo/desconto sem alucinar

A IA **nunca inventa** número. Toda vez que precisa decidir comercialmente, ela chama uma **tool** (function calling do Claude):

| Tool | O que faz |
|------|-----------|
| `calcular_orcamento` | Lê `lib/pricing/tabela.ts` (R$/m² por tipo de móvel + acabamento) e devolve faixa |
| `consultar_prazo_producao` | Lê `lib/pricing/timeline.ts` (capacidade da fábrica) e devolve semanas |
| `avaliar_desconto` | Aplica regras de `lib/pricing/discount.ts` (à vista, volume, justificativa) |
| `agendar_visita` | Marca no Google Calendar (futuro) |
| `passar_para_humano` | Notifica vendedora humana com resumo |

Você define as regras no código → IA executa. Sem alucinação possível.

## Setup

```bash
cd vendedora-ia
npm install
cp .env.example .env.local
# preencher chaves
npm run dev
```

Variáveis de ambiente necessárias em `.env.example`.

## Estrutura

```
app/
  api/webhook/whatsapp/route.ts   # recebe msg → dispara agent
  api/cron/followup/route.ts       # follow-up de leads parados
  admin/page.tsx                   # dashboard de conversas
lib/
  ai/
    agent.ts                       # loop principal Claude
    system-prompt.ts               # persona + políticas
    tools.ts                       # ferramentas de negócio
    router.ts                      # decide Haiku vs Sonnet
  whatsapp/
    meta.ts                        # cliente Meta Cloud API
    humanize.ts                    # delays + fragmentação
  pricing/
    tabela.ts                      # R$/m² por tipo
    timeline.ts                    # prazos
    discount.ts                    # regras de desconto
  db/
    client.ts                      # Supabase
supabase/
  schema.sql                       # tabelas
```

## Próximos passos (depois do MVP)

- [ ] Transcrição de áudio (Whisper API ou Gemini)
- [ ] Análise de fotos do ambiente do cliente (Claude vision)
- [ ] Integração com IARCO pra orçamento real a partir de PDF
- [ ] Agendamento via Google Calendar
- [ ] CRM mais completo (pipeline, follow-up automático)
- [ ] Dashboard com métricas (taxa de conversão, ticket médio, motivos de não-fechamento)
