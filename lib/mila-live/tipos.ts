export type MilaAcao =
  | { tipo: "ignorar"; motivo: string }
  | { tipo: "responder"; texto: string }
  | { tipo: "pedir_autorizacao"; sub_tipo: "fechamento" | "desconto"; contexto: string; proposta: string; valor?: number }
  | { tipo: "escalar_humano"; motivo: string };

export interface ChatComContexto {
  chat_id: string;
  contact_id: string;
  channel_account_id: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  ultima_msg_cliente_id: string;
  ultima_msg_cliente: string;
  ultima_msg_cliente_em: string;
  historico: Array<{
    direcao: "entrada" | "saida";
    conteudo: string;
    enviada_em: string;
  }>;
}
