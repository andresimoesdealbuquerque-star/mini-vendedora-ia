/**
 * Cálculo de orçamento — Mila chama o endpoint do MINIDECK
 * (https://minideck.arcomini.com.br/api/calcular-orcamento), que usa a
 * lógica da aba Formini (custo MDF × multiplicador + adicionais).
 *
 * MEDIDAS são obrigatórias. Se faltarem, o endpoint retorna 400 com
 * `campos_faltando` e `descricao_campos`. A Mila usa isso pra perguntar
 * ao cliente os campos que faltam.
 */

const MINIDECK_API_URL =
  process.env.MINIDECK_API_URL ?? "https://minideck.arcomini.com.br/api/calcular-orcamento";
const MINIDECK_TIMEOUT_MS = 12_000;

export interface OrcamentoInput {
  modelo: string;
  cor: string;
  /**
   * Campos da geometria do modelo (em CM pra dimensões físicas, número
   * inteiro pra n_*). A maioria dos modelos requer C/P/A. Alguns têm:
   *   n_g (gavetas), n_prat (prateleiras), n_div (divisórias),
   *   n_portas (portas), C1 / C2 (mesa em L: braço maior/menor)
   */
  medidas?: {
    C?: number; P?: number; A?: number;
    C1?: number; C2?: number;
    n_g?: number; n_prat?: number; n_div?: number; n_portas?: number;
  };
  puxador?: { tipo: string; cor?: string; qtd: number };
  adicionais?: Record<string, boolean | number>;
}

export interface OrcamentoOutput {
  ok: boolean;
  modelo: string;
  cor: string;
  total?: number;
  total_formatado?: string;
  formatado_para_cliente?: string;
  itens?: Array<{ label: string; valor: number; tipo: string }>;
  preco_base?: number;
  adicionais_total?: number;
  multiplicador_aplicado?: number;
  validade_dias?: number;
  observacoes?: string[];
  fonte?: string;
  // Erros estruturados
  erro?: string;
  campos_requeridos?: string[];
  campos_faltando?: string[];
  descricao_campos?: Record<string, string>;
  sugestoes?: string[];
}

export async function calcularOrcamento(input: OrcamentoInput): Promise<OrcamentoOutput> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MINIDECK_TIMEOUT_MS);
    const r = await fetch(MINIDECK_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = (await r.json()) as OrcamentoOutput;
    return data;
  } catch (e) {
    return {
      ok: false,
      modelo: input.modelo,
      cor: input.cor,
      erro: `MINIDECK fora do ar: ${e instanceof Error ? e.message : "erro de conexão"}. Avise o cliente que vai retornar em alguns minutos e passe pra humano.`,
    };
  }
}
