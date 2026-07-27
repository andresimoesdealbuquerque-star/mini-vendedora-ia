/**
 * Classificador de desfecho e causa-raiz por conversa. Roda em batch pra
 * gerar o Panorama de perdas da Mini.
 *
 * Usa Haiku pra economizar (é uma classificação simples com taxonomia fechada).
 */

import Anthropic from "@anthropic-ai/sdk";
import { HAIKU } from "./router";

const client = new Anthropic();

export type Desfecho = "fechado" | "perdido" | "em_andamento";
export type MotivoPerda =
  | "atendimento_demorado"
  | "vendedora_sumiu"
  | "erro_comercial"
  | "preco_alto"
  | "fora_do_escopo"
  | "vou_pensar"
  | "foi_pra_concorrencia"
  | "prazo_nao_bateu"
  | "sem_motivo_claro"
  | "fechado_com_sucesso"
  | "em_andamento";

export interface MensagemPerda {
  direcao: "entrada" | "saida";
  autor: string | null;
  conteudo: string | null;
  enviada_em: string | null;
}

export interface AnaliseDesfecho {
  desfecho: Desfecho;
  motivo_principal: MotivoPerda;
  motivos_secundarios: MotivoPerda[];
  resumo: string;
  citacoes: string[];               // trechos curtos da conversa
  vendedor_id: string | null;        // último vendedor que respondeu
  minutos_ate_primeira_resposta: number | null;
  primeira_msg_em: string | null;
  ultima_msg_em: string | null;
}

const SYSTEM = `Você é uma ANALISTA de vendas da Mini Marcenaria. Sua função é ler uma conversa do WhatsApp entre cliente e vendedora, classificar o desfecho e o motivo principal.

Devolva APENAS este JSON (sem texto fora):

{
  "desfecho": "fechado" | "perdido" | "em_andamento",
  "motivo_principal": "<uma das opções da taxonomia>",
  "motivos_secundarios": ["<outros motivos, opcional>"],
  "resumo": "1-2 frases descrevendo o que rolou",
  "citacoes": ["trecho curto 1", "trecho curto 2"]
}

## Como decidir o desfecho

- **fechado**: cliente confirmou pagamento (PIX enviado, comprovante, "fechei", "combinado"), OU vendedora coletou dados finais e disse "pedido cadastrado"
- **em_andamento**: última mensagem foi há < 3 dias E ainda tem sinal de interesse
- **perdido**: > 3 dias sem resposta OU cliente disse explicitamente que não vai fechar OU vendedora perdeu o gancho

## Taxonomia dos motivos

- **atendimento_demorado**: vendedora respondeu com atraso > 2h em pelo menos 1 momento crítico, cliente perdeu o timing
- **vendedora_sumiu**: vendedora prometeu retorno e nunca voltou (ex: "vou calcular e te mando")
- **erro_comercial**: vendedora informou desconto errado, frete errado, prazo errado. Ex: cotou 5% em vez de 8% à vista, cotou frete pra CG quando é grátis
- **preco_alto**: cliente reclamou explicitamente do preço, pediu desconto e não fechou
- **fora_do_escopo**: cliente pediu algo que a Mini não faz (cama, embutido, planejado, curva, vidro)
- **vou_pensar**: cliente disse "vou pensar", "depois te aviso", "vou ver com meu marido" e nunca voltou
- **foi_pra_concorrencia**: cliente mencionou outra marcenaria ou disse que comprou em outro lugar
- **prazo_nao_bateu**: cliente precisava mais rápido que os 17 dias úteis
- **sem_motivo_claro**: conversa parou sem sinal claro de por quê, cliente sumiu sem explicação
- **fechado_com_sucesso**: use APENAS quando desfecho = "fechado"
- **em_andamento**: use APENAS quando desfecho = "em_andamento"

## Citações

2-4 trechos CURTOS da conversa que evidenciem o motivo. Ex: "cliente: 'ta caro, dá pra fazer 100 menos?'" ou "vendedora: 'vou calcular e te volto' (nunca voltou)"

Agora analise a conversa abaixo:`;

export async function analisarDesfecho(mensagens: MensagemPerda[]): Promise<AnaliseDesfecho | { erro: string }> {
  if (mensagens.length === 0) return { erro: "sem mensagens" };

  const linhas = mensagens.filter((m) => m.conteudo).map((m) => {
    const data = m.enviada_em ? new Date(m.enviada_em).toLocaleString("pt-BR") : "?";
    const quem = m.direcao === "entrada" ? "CLIENTE" : "VENDEDORA";
    return `[${data}] ${quem}: ${m.conteudo}`;
  }).join("\n");

  // Calcula métricas simples sem IA
  const primeiraMsg = mensagens.find((m) => m.enviada_em)?.enviada_em ?? null;
  const ultimaMsg = [...mensagens].reverse().find((m) => m.enviada_em)?.enviada_em ?? null;
  const primeiraCliente = mensagens.find((m) => m.direcao === "entrada" && m.enviada_em);
  const primeiraVendedora = mensagens.find((m) => m.direcao === "saida" && m.enviada_em);
  let minutosPrimeiraResp: number | null = null;
  if (primeiraCliente?.enviada_em && primeiraVendedora?.enviada_em) {
    const diff = new Date(primeiraVendedora.enviada_em).getTime() - new Date(primeiraCliente.enviada_em).getTime();
    if (diff > 0) minutosPrimeiraResp = Math.round(diff / 60000);
  }
  const vendedorId = [...mensagens].reverse().find((m) => m.direcao === "saida" && m.autor)?.autor ?? null;

  try {
    const r = await client.messages.create({
      model: HAIKU,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: `Data hoje: ${new Date().toLocaleDateString("pt-BR")}\n\nCONVERSA:\n${linhas}\n\nDevolva o JSON.` }],
    });
    const text = r.content[0].type === "text" ? r.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { erro: "IA sem JSON" };
    const parsed = JSON.parse(json) as Omit<AnaliseDesfecho, "vendedor_id" | "minutos_ate_primeira_resposta" | "primeira_msg_em" | "ultima_msg_em">;
    return {
      ...parsed,
      vendedor_id: vendedorId,
      minutos_ate_primeira_resposta: minutosPrimeiraResp,
      primeira_msg_em: primeiraMsg,
      ultima_msg_em: ultimaMsg,
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "erro" };
  }
}
