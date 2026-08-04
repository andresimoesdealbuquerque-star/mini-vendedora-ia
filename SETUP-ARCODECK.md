# Mila × Arco Deck — aviso de "novo negócio pra você" (Fase 1) — via CLINT

Quando a **Vitória atribui um projetista** (Livia/Edvando) a um projeto no Arco
Deck, a Mila manda um WhatsApp pro projetista com o resumo + link do cliente +
link do projeto. O envio é pelo **Clint** (mesmo número da Mila), usando um
**template aprovado** (obrigatório fora da janela de 24h). **Não usa a Meta direto.**

Fluxo: Arco Deck grava evento `atribuido` na tabela `eventos` → **Supabase
Database Webhook** chama `POST /api/arcodeck/atribuicao` → Clint envia o template.

Arquivos: `app/api/arcodeck/atribuicao/route.ts`, `app/api/arcodeck/clint-info/route.ts`,
`lib/arcodeck/client.ts`, `enviarTemplate()`/`listarTemplates()` em `lib/clint/client.ts`.

## 1) Variáveis de ambiente (Vercel → vendedora-ia → Settings → Environment Variables)

Já feitas: `ARCODECK_SUPABASE_URL`, `ARCODECK_SUPABASE_KEY`, `ARCODECK_WEBHOOK_SECRET`.

Faltam (via Clint):
```
CLINT_API_TOKEN=...                  # provavelmente JÁ existe (a Mila usa)
CLINT_TEMPLATE_ID_ATRIBUICAO=...     # UUID do template (pega no passo 3)
CLINT_CHANNEL_ACCOUNT_ID=...         # opcional: UUID do canal WhatsApp Oficial (senão detecta sozinho)
```
❌ NÃO precisa mais de `META_PHONE_NUMBER_ID` / `META_WHATSAPP_TOKEN` pra isso.
(`ARCODECK_TEMPLATE_ATRIBUICAO` do plano antigo ficou sem uso — pode ignorar.)

## 2) Criar o template no CLINT

No painel do Clint → **WhatsApp Oficial → Modelos/Templates → criar**:
- **Nome:** `arco_novo_negocio` · **Categoria:** Utility · **Idioma:** Português (BR)
- **Corpo** (6 variáveis — os links vão no texto, não em botão):
  ```
  Olá {{1}}! 👋 A Vitória te passou um novo cliente no Arco Deck.

  *Cliente:* {{2}}
  *Tamanho:* {{3}} · *Canal:* {{4}}

  📱 Falar com o cliente: {{5}}
  📋 Ver o projeto: {{6}}

  Bora fechar! 💪
  ```
  Ordem das variáveis: {{1}} projetista · {{2}} cliente · {{3}} tamanho · {{4}} canal · {{5}} link do cliente · {{6}} link do projeto.
  Amostras: Edvando · Maria Silva · Médio · Insta Arco · https://wa.me/5583999999999 · https://arcodeck.arcomini.com.br/?projeto=proj_123
- Enviar pra aprovação (o Clint submete à Meta; costuma sair rápido).

## 3) Pegar o `template_id` e o `channel_account_id`

Depois de aprovado e com o deploy no ar, abra no navegador:
```
https://<SEU-DOMINIO-VENDEDORA-IA>/api/arcodeck/clint-info?secret=<ARCODECK_WEBHOOK_SECRET>
```
Copie o `template_id` do `arco_novo_negocio` → env `CLINT_TEMPLATE_ID_ATRIBUICAO`.
(Se quiser fixar o canal, copie o `channel_account_id` do WHATSAPP_OFFICIAL → `CLINT_CHANNEL_ACCOUNT_ID`.)
Depois de setar, **Redeploy**.

## 4) Cadastrar Livia e Edvando como CONTATOS no Clint

O envio é por `contact_id`, então os dois precisam existir como contato no Clint,
com os números: Livia `+55 83 99936-8877`, Edvando `+55 83 99680-8321`.
(É uma vez só. Se não existirem, o webhook ignora com um aviso no retorno.)

## 5) Criar o Webhook no Supabase do Arco Deck

Supabase (Arco Deck) → **Database → Webhooks → Create**:
- Tabela `eventos` · Evento **Insert** · **HTTP POST**
- URL: `https://<SEU-DOMINIO-VENDEDORA-IA>/api/arcodeck/atribuicao`
- Header: `x-arcodeck-secret` = `ARCODECK_WEBHOOK_SECRET`

O endpoint ignora sozinho o que não for `atribuido`.

## 6) Testar

- No Arco Deck, atribua Livia/Edvando a um projeto → deve chegar o WhatsApp.
- Ou simule:
  ```
  curl -X POST https://<DOMINIO>/api/arcodeck/atribuicao \
    -H "Content-Type: application/json" -H "x-arcodeck-secret: <SEGREDO>" \
    -d '{"record":{"data":{"tipo":"atribuido","para":"Edvando","cliente":"Teste","projetoId":"proj_1"}}}'
  ```

## Observações
- Fora da janela de 24h só rola **template** — por isso o passo 2.
- Números em `PROJETISTA_WHATSAPP` (em `route.ts`); pra mudar, edite lá.
- Coach diário (Fase 2) ainda não incluído.
