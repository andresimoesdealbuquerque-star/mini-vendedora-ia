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
  ultima_msg_cliente: string;       // pode ser "[imagem enviada]" se for foto
  ultima_msg_cliente_em: string;
  ultima_msg_e_imagem: boolean;      // sinal pro responder pegar vision
  historico: Array<{
    direcao: "entrada" | "saida";
    conteudo: string;
    tipo?: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | string;
    midia_url?: string | null;
    enviada_em: string;
  }>;
}
