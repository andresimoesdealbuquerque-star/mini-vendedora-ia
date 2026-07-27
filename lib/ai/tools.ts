/**
 * Tools que a Mila pode chamar. Definem o limite do que ela pode prometer
 * sozinha — toda decisão comercial passa por essas funções, que aplicam
 * regras determinísticas em vez de deixar a IA inventar.
 */

import Anthropic from "@anthropic-ai/sdk";
import { calcularOrcamento } from "@/lib/pricing/tabela";
import { consultarPrazoProducao } from "@/lib/pricing/timeline";
import { avaliarDesconto } from "@/lib/pricing/discount";
import { calcularFrete } from "@/lib/pricing/frete";
import { atualizarLead, agendarVisita, passarParaHumano, registrarPedido } from "@/lib/db/leads";
import { obterMidia, MIDIAS } from "@/lib/midia/midias";
import { PAGINAS_CATALOGO, SLUGS_DISPONIVEIS, urlCatalogo, rotuloCatalogo } from "@/lib/ai/conhecimento/paginas-catalogo";
import { MODELOS, CORES, PUXADOR_TIPOS, PUXADOR_CORES, ADICIONAIS_BOOLEAN, ADICIONAIS_QUANTIDADE } from "@/lib/pricing/catalogo";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "calcular_orcamento",
    description:
      "Calcula orçamento via aba Formini do MINIDECK (custo MDF × multiplicador + adicionais). MEDIDAS SÃO OBRIGATÓRIAS — sem medidas o endpoint retorna erro com a lista de campos faltando. NUNCA invente valor.",
    input_schema: {
      type: "object",
      properties: {
        modelo: {
          type: "string",
          description: `Nome exato do modelo. Modelos: ${MODELOS.join(", ")}.`,
        },
        cor: {
          type: "string",
          description: `Nome da cor. Cores: ${CORES.map((c) => c.nome).join(", ")}.`,
        },
        medidas: {
          type: "object",
          description: "Medidas em cm (dimensões físicas) ou inteiro (n_*). Cada modelo pede um subset destes campos. Quase todos pedem C/P/A. Se faltar campo, o endpoint retorna 400 com lista — pergunte ao cliente os que faltam.",
          properties: {
            C: { type: "number", description: "Comprimento em cm" },
            P: { type: "number", description: "Profundidade em cm" },
            A: { type: "number", description: "Altura em cm" },
            C1: { type: "number", description: "Braço maior em cm (Mesa em L)" },
            C2: { type: "number", description: "Braço menor em cm (Mesa em L)" },
            n_g: { type: "integer", description: "Número de gavetas" },
            n_prat: { type: "integer", description: "Número de prateleiras" },
            n_div: { type: "integer", description: "Número de divisórias" },
            n_portas: { type: "integer", description: "Número de portas" },
          },
        },
        puxador: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: [...PUXADOR_TIPOS] },
            cor: { type: "string", enum: [...PUXADOR_CORES], description: "Não aplicável a Cava nem Fecho e toque" },
            qtd: { type: "integer", minimum: 1 },
          },
        },
        adicionais: {
          type: "object",
          description: "Adicionais selecionados pelo cliente. Booleans (true/false) pra: " +
            ADICIONAIS_BOOLEAN.map(a => a.key).join(", ") +
            ". Inteiros (qtd) pra: " + ADICIONAIS_QUANTIDADE.map(a => a.key).join(", ") + ".",
          properties: {
            ...Object.fromEntries(ADICIONAIS_BOOLEAN.map(a => [a.key, { type: "boolean", description: a.label }])),
            ...Object.fromEntries(ADICIONAIS_QUANTIDADE.map(a => [a.key, { type: "integer", minimum: 0, description: a.label }])),
          },
        },
      },
      required: ["modelo", "cor", "medidas"],
    },
  },
  {
    name: "consultar_prazo_producao",
    description:
      "Devolve prazo de produção+entrega da Mini (atualmente 17 dias úteis fixo). Chame antes de prometer prazo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "calcular_frete",
    description:
      "Cota frete para a cidade do cliente. JP/CG: grátis. Recife/Natal: R$ 59,90. Outras cidades: precisa de humano. Chame antes de informar valor de frete.",
    input_schema: {
      type: "object",
      properties: {
        cidade: { type: "string", description: "Cidade do cliente" },
        estado: { type: "string", description: "Sigla do estado (PB, PE, RN, etc)" },
      },
      required: ["cidade"],
    },
  },
  {
    name: "avaliar_desconto",
    description:
      "Avalia desconto pedido pelo cliente. Política Mini: 8% padrão à vista (PIX/dinheiro/transferência); 12x sem juros no cartão sem desconto adicional. Em períodos de promoção, teto à vista pode subir pra 10% ou 12% — a função aplica automaticamente. NUNCA prometa desconto antes de chamar.",
    input_schema: {
      type: "object",
      properties: {
        valor_orcado: { type: "number", description: "Valor do orçamento em reais" },
        desconto_pedido_reais: { type: "number", description: "Desconto pedido em reais (não percentual)" },
        condicao_pagamento: { type: "string", enum: ["a_vista", "cartao"], description: "a_vista = PIX/dinheiro/transferência; cartao = 12x sem juros" },
        justificativa_cliente: { type: "string" },
      },
      required: ["valor_orcado", "desconto_pedido_reais", "condicao_pagamento"],
    },
  },
  {
    name: "atualizar_lead",
    description: "Salva info do cliente no CRM. Chame sempre que descobrir algo novo.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        modelo_interesse: { type: "string", description: "Modelo do FORMINI que despertou interesse" },
        cor_preferida: { type: "string" },
        faixa_orcamento: { type: "string" },
        prazo_desejado: { type: "string" },
        regiao: { type: "string", description: "bairro ou cidade" },
        origem: { type: "string", description: "instagram, indicacao, site, google, outro" },
        etapa: {
          type: "string",
          enum: ["aquecimento", "qualificacao", "diagnostico", "orcamento", "negociacao", "agendamento", "fechado", "perdido"],
        },
        observacoes: { type: "string", description: "qualquer info útil pra próxima conversa" },
      },
    },
  },
  {
    name: "agendar_visita",
    description:
      "Agenda visita do cliente ao showroom OU envio de proposta detalhada. Use quando cliente demonstrou intenção de fechar.",
    input_schema: {
      type: "object",
      properties: {
        nome_cliente: { type: "string" },
        endereco: { type: "string" },
        data_sugerida: { type: "string", description: "YYYY-MM-DD" },
        periodo: { type: "string", enum: ["manha", "tarde"] },
        observacoes: { type: "string" },
      },
      required: ["nome_cliente", "endereco", "data_sugerida", "periodo"],
    },
  },
  {
    name: "registrar_pedido",
    description:
      "Registra pedido aprovado pelo cliente pra cadastro no MINIDECK. Chame APÓS: cliente confirmou os móveis + valor, escolheu forma de pagamento, e forneceu todos os dados pessoais e endereço. Devolve as instruções de pagamento (chave PIX ou aviso de link Rede).",
    input_schema: {
      type: "object",
      properties: {
        nome_completo: { type: "string" },
        telefone: { type: "string", description: "Formato: 5583999999999" },
        email: { type: "string" },
        tipo_documento: { type: "string", enum: ["CPF", "CNPJ"] },
        documento: { type: "string" },
        endereco_rua: { type: "string" },
        endereco_numero: { type: "string" },
        endereco_complemento: { type: "string" },
        endereco_bairro: { type: "string" },
        endereco_cidade: { type: "string" },
        endereco_uf: { type: "string", description: "UF (PB, PE, RN, etc)" },
        endereco_cep: { type: "string" },
        moveis: {
          type: "array",
          items: {
            type: "object",
            properties: {
              modelo: { type: "string" },
              cor: { type: "string" },
              medida: { type: "string", description: "ex: 1.80 × 0.55 × 0.90" },
              puxador: { type: "string" },
              adicionais: { type: "array", items: { type: "string" } },
              valor: { type: "number" },
            },
            required: ["modelo", "cor", "valor"],
          },
        },
        forma_pagamento: { type: "string", enum: ["pix_avista", "cartao_12x"] },
        valor_total: { type: "number" },
        observacoes: { type: "string" },
      },
      required: [
        "nome_completo", "telefone", "tipo_documento", "documento",
        "endereco_rua", "endereco_numero", "endereco_bairro", "endereco_cidade",
        "moveis", "forma_pagamento", "valor_total",
      ],
    },
  },
  {
    name: "enviar_midia",
    description:
      `Envia uma arte/imagem pro cliente. Use quando fizer sentido visualmente. Mídias disponíveis:\n${Object.values(MIDIAS).map((m) => `- ${m.id}: ${m.descricao} | quando usar: ${m.quando_usar}`).join("\n")}`,
    input_schema: {
      type: "object",
      properties: {
        midia_id: { type: "string", enum: Object.keys(MIDIAS) },
      },
      required: ["midia_id"],
    },
  },
  {
    name: "mostrar_catalogo",
    description:
      `Envia páginas do Catálogo 2026 como IMAGEM no WhatsApp do cliente. Use SEMPRE que o cliente:
- pedir pra ver algo ("me mostra", "manda uma foto", "quero ver modelos", "tem imagem?")
- perguntar sobre uma categoria de móvel ("quais racks vocês têm?", "quero ver os buffets")
- pedir cores ("tem preto?" → mostra a página "cores")
- ficar em dúvida entre modelos (mostra a página da categoria pra ele escolher A/B/C…)

Escolha os slugs MAIS ESPECÍFICOS possíveis. Ex: cliente pediu "buffet de 3 portas" → use apenas "buffet-3-portas". Se pediu genérico "quero ver buffets" → use os 3: "buffet-2-portas", "buffet-3-portas", "buffet-4-portas".

Slugs disponíveis:\n${Object.entries(PAGINAS_CATALOGO).map(([s, m]) => `- ${s}: ${m.rotulo}`).join("\n")}`,
    input_schema: {
      type: "object",
      properties: {
        slugs: {
          type: "array",
          items: { type: "string", enum: SLUGS_DISPONIVEIS },
          description: "Uma ou mais páginas do catálogo, na ordem que fazem sentido pro cliente ver.",
          minItems: 1,
          maxItems: 4,
        },
      },
      required: ["slugs"],
    },
  },
  {
    name: "passar_para_humano",
    description:
      "Transfere a conversa pra atendente humana. Use quando: cliente pedir explicitamente, conversa travar, pedido fora do padrão (medidas muito diferentes do FORMINI, móvel customizado), reclamação pós-venda, ou cliente prestes a fechar pedido grande.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        urgencia: { type: "string", enum: ["baixa", "media", "alta"] },
        resumo: {
          type: "string",
          description: "Resumo da conversa (nome, modelo, cor, etapa, último impasse)",
        },
      },
      required: ["motivo", "urgencia", "resumo"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  leadId: string,
): Promise<unknown> {
  switch (name) {
    case "calcular_orcamento":
      return calcularOrcamento(input as unknown as Parameters<typeof calcularOrcamento>[0]);
    case "consultar_prazo_producao":
      return consultarPrazoProducao();
    case "calcular_frete":
      return calcularFrete(input as unknown as Parameters<typeof calcularFrete>[0]);
    case "avaliar_desconto":
      return avaliarDesconto(input as unknown as Parameters<typeof avaliarDesconto>[0]);
    case "atualizar_lead":
      return atualizarLead(leadId, input);
    case "agendar_visita":
      return agendarVisita(leadId, input as unknown as Parameters<typeof agendarVisita>[1]);
    case "registrar_pedido":
      return registrarPedido(leadId, input as unknown as Parameters<typeof registrarPedido>[1]);
    case "enviar_midia":
      return obterMidia((input as { midia_id: any }).midia_id);
    case "mostrar_catalogo": {
      const slugs = (input as { slugs?: string[] }).slugs ?? [];
      const validos = slugs.filter((s) => urlCatalogo(s));
      const invalidos = slugs.filter((s) => !urlCatalogo(s));
      return {
        enviadas: validos.map((slug) => ({
          slug,
          rotulo: rotuloCatalogo(slug),
          url: urlCatalogo(slug),
        })),
        invalidas: invalidos,
        instrucao_ao_modelo: validos.length
          ? "Imagens serão anexadas na sua próxima resposta. Comente brevemente o que o cliente está vendo (ex: 'Manda uma olhada, tá tudo nessa página. O modelo D é o maior…') e pergunte o que ele achou."
          : "Nenhum slug válido — refaça a chamada com um slug da lista acima.",
      };
    }
    case "passar_para_humano":
      return passarParaHumano(leadId, input as unknown as Parameters<typeof passarParaHumano>[1]);
    default:
      return { erro: `Tool desconhecida: ${name}` };
  }
}
