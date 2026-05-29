/**
 * Prazo de produção da Mini Marcenaria.
 *
 * Regra atual (definida pelo dono): **17 dias úteis** a partir da
 * confirmação do pedido até a entrega. Independe de modelo, cor ou
 * complexidade — fluxo padrão da fábrica.
 *
 * Ajuste DIAS_UTEIS_PADRAO se mudar de patamar.
 */

const DIAS_UTEIS_PADRAO = 17;

export interface PrazoOutput {
  dias_uteis: number;
  data_entrega_iso: string;
  texto_para_cliente: string;
  observacao_interna: string;
}

export function consultarPrazoProducao(): PrazoOutput {
  const dias = DIAS_UTEIS_PADRAO;
  const dataEntrega = somarDiasUteis(new Date(), dias);
  const fmt = dataEntrega.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });

  return {
    dias_uteis: dias,
    data_entrega_iso: dataEntrega.toISOString().split("T")[0],
    texto_para_cliente: `Entrega em ${dias} dias úteis após a confirmação do pedido — previsão pra ${fmt}.`,
    observacao_interna: "Prazo padrão Mini, conta de hoje. Se houver fila grande na fábrica, ajustar.",
  };
}

function somarDiasUteis(inicio: Date, dias: number): Date {
  const d = new Date(inicio);
  let restantes = dias;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    const diaSemana = d.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes--;
  }
  return d;
}
