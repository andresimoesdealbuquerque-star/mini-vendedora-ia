-- Schema da vendedora IA. Roda no SQL Editor do Supabase.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  nome text,
  modelo_interesse text,
  cor_preferida text,
  faixa_orcamento text,
  prazo_desejado text,
  regiao text,
  origem text,
  etapa text default 'aquecimento',
  observacoes text,
  handed_off_at timestamptz,
  handed_back_at timestamptz,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists leads_phone_idx on leads(phone);
create index if not exists leads_etapa_idx on leads(etapa);
create index if not exists leads_last_message_idx on leads(last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  message_id text, -- id do WhatsApp pra dedup
  created_at timestamptz default now()
);

create index if not exists messages_lead_id_idx on messages(lead_id, created_at);
create unique index if not exists messages_dedup_idx on messages(message_id) where message_id is not null;

create table if not exists orcamentos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  valor_referencia integer not null,
  valor_min integer not null,
  valor_max integer not null,
  detalhamento text,
  payload jsonb,
  status text default 'enviado' check (status in ('enviado', 'aprovado', 'em_negociacao', 'rejeitado', 'expirado')),
  validade_dias integer default 15,
  created_at timestamptz default now()
);

create index if not exists orcamentos_lead_id_idx on orcamentos(lead_id);

create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  endereco text,
  data date,
  periodo text,
  status text default 'agendada' check (status in ('agendada', 'realizada', 'cancelada', 'no_show')),
  observacoes text,
  created_at timestamptz default now()
);

create index if not exists visitas_lead_id_idx on visitas(lead_id);
create index if not exists visitas_data_idx on visitas(data);

create table if not exists handoffs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  motivo text,
  urgencia text,
  resumo text,
  notificado_em timestamptz default now()
);

create table if not exists pedidos_pendentes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  nome_completo text not null,
  telefone text not null,
  email text,
  tipo_documento text check (tipo_documento in ('CPF', 'CNPJ')),
  documento text not null,
  endereco_rua text not null,
  endereco_numero text not null,
  endereco_complemento text,
  endereco_bairro text not null,
  endereco_cidade text not null,
  endereco_uf text,
  endereco_cep text,
  moveis jsonb not null,
  forma_pagamento text not null,
  valor_total integer not null,
  valor_sinal integer,
  valor_saldo integer,
  observacoes text,
  status text default 'aguardando_pagamento' check (status in ('aguardando_pagamento', 'pago_sinal', 'pago_total', 'cadastrado_minideck', 'cancelado')),
  created_at timestamptz default now()
);

create index if not exists pedidos_pendentes_lead_id_idx on pedidos_pendentes(lead_id);
create index if not exists pedidos_pendentes_status_idx on pedidos_pendentes(status);

-- ──────────────────────────────────────────────────────────────────────────
-- Tabelas de preço — vivem em `app_kv` (compartilhado com MINIDECK)
-- ──────────────────────────────────────────────────────────────────────────
-- Mila usa as MESMAS chaves que o MINIDECK escreve, evitando duplicação:
--   key = 'mini_tabela_formini' → value = { 'Mesa X': { branco: 678, ... } }
--   key = 'mini_tabela_precos'  → value = { adicionais, puxadores, ... }
-- A tabela `app_kv` já existe (criada pelo pedidos-app). Schema lá:
--   create table app_kv (key text primary key, value jsonb, updated_at timestamptz);

-- ──────────────────────────────────────────────────────────────────────────
-- Ensinar a Mila — regras e exemplos editáveis via /admin/playground
-- ──────────────────────────────────────────────────────────────────────────

-- Regras em linguagem natural ("quando X, faça Y")
create table if not exists mila_regras (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  ativa boolean not null default true,
  ordem integer not null default 0,            -- pra ordenar visualmente
  criada_em timestamptz default now(),
  atualizada_em timestamptz default now()
);
create index if not exists mila_regras_ativa_idx on mila_regras(ativa, ordem);

-- Pares de exemplo (mensagem cliente → resposta correta da Mila)
create table if not exists mila_exemplos (
  id uuid primary key default gen_random_uuid(),
  mensagem_cliente text not null,
  resposta_correta text not null,
  contexto text,                                -- opcional: contexto da situação
  ativa boolean not null default true,
  ordem integer not null default 0,
  origem text default 'manual' check (origem in ('manual', 'playground_correcao')),
  criada_em timestamptz default now(),
  atualizada_em timestamptz default now()
);
create index if not exists mila_exemplos_ativa_idx on mila_exemplos(ativa, ordem);

-- ──────────────────────────────────────────────────────────────────────────
-- Integração Clint — cache de conversas do CRM + sugestões de recuperação
-- ──────────────────────────────────────────────────────────────────────────

-- Cache local de contatos do Clint (espelho mínimo pro analisador)
create table if not exists clint_contatos (
  clint_id text primary key,                       -- id do contato no Clint
  nome text,
  telefone text,
  email text,
  etapa_funil text,                                -- onde está no funil Clint
  ultima_mensagem_em timestamptz,
  metadados jsonb,                                 -- payload bruto pra extensão futura
  sincronizado_em timestamptz default now()
);
create index if not exists clint_contatos_telefone_idx on clint_contatos(telefone);
create index if not exists clint_contatos_ultima_msg_idx on clint_contatos(ultima_mensagem_em desc);

-- Cache de chats (uma "thread" de WhatsApp com um contato)
create table if not exists clint_chats (
  clint_id text primary key,
  contato_clint_id text references clint_contatos(clint_id) on delete cascade,
  canal text,                                       -- whatsapp, instagram, etc
  status text,
  ultima_mensagem_em timestamptz,
  metadados jsonb,
  sincronizado_em timestamptz default now()
);
create index if not exists clint_chats_contato_idx on clint_chats(contato_clint_id);

-- Cache de mensagens individuais
create table if not exists clint_mensagens (
  clint_id text primary key,
  chat_clint_id text references clint_chats(clint_id) on delete cascade,
  direcao text check (direcao in ('entrada', 'saida')),   -- cliente → vendedor / vendedor → cliente
  autor text,                                       -- nome de quem mandou (vendedor) ou número (cliente)
  conteudo text,
  tipo text,                                        -- text, image, audio, document, ...
  midia_url text,
  enviada_em timestamptz,
  metadados jsonb,
  sincronizado_em timestamptz default now()
);
create index if not exists clint_mensagens_chat_idx on clint_mensagens(chat_clint_id, enviada_em);

-- Sugestões de retomada/recuperação geradas pela Mila
create table if not exists mila_recuperacao (
  id uuid primary key default gen_random_uuid(),
  contato_clint_id text not null references clint_contatos(clint_id) on delete cascade,
  chat_clint_id text references clint_chats(clint_id) on delete set null,
  -- diagnóstico
  calor text check (calor in ('quente', 'morno', 'frio', 'perdido')),
  etapa_parou text,                                 -- 'aquecimento' | 'qualificacao' | 'orcamento' | 'negociacao' | 'fechamento' | etc
  dias_sem_resposta integer,
  diagnostico text,                                  -- análise em texto livre
  pontos_fortes jsonb default '[]'::jsonb,
  oportunidades_perdidas jsonb default '[]'::jsonb,
  -- proposta de ação
  texto_sugerido text not null,
  midia_sugerida text,                              -- ex: 'paleta_cores' | 'dados_fechamento' | 'pix_pagamento'
  -- status
  status text default 'pendente' check (status in ('pendente', 'aprovada', 'enviada', 'descartada', 'falhou')),
  motivo_descarte text,
  enviada_em timestamptz,
  resposta_recebida_em timestamptz,                 -- preenchido se o cliente responder após envio
  -- tracking
  criada_em timestamptz default now(),
  atualizada_em timestamptz default now()
);
create index if not exists mila_recuperacao_status_idx on mila_recuperacao(status, criada_em desc);
create index if not exists mila_recuperacao_contato_idx on mila_recuperacao(contato_clint_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Usuários do Clint (vendedoras) + avaliações da Mila sobre o atendimento delas
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists clint_usuarios (
  clint_id text primary key,
  nome text,
  email text,
  ativo boolean default true,
  sincronizado_em timestamptz default now()
);

create table if not exists mila_avaliacoes_vendedor (
  id uuid primary key default gen_random_uuid(),
  vendedor_clint_id text not null references clint_usuarios(clint_id) on delete cascade,
  -- escopo da avaliação
  conversas_analisadas integer not null,
  desde timestamptz,
  ate timestamptz,
  -- scores 0-10
  score_geral numeric(3,1),
  score_tempo_resposta numeric(3,1),
  score_completude numeric(3,1),
  score_tom numeric(3,1),
  score_conversao numeric(3,1),
  -- análise
  pontos_fortes jsonb default '[]'::jsonb,
  pontos_fracos jsonb default '[]'::jsonb,
  exemplos jsonb default '[]'::jsonb,           -- [{ conversa_id, problema, sugestao }]
  sugestoes_treinamento jsonb default '[]'::jsonb,
  resumo_executivo text,
  criada_em timestamptz default now()
);

create index if not exists mila_avaliacoes_vend_idx on mila_avaliacoes_vendedor(vendedor_clint_id, criada_em desc);

-- ──────────────────────────────────────────────────────────────────────────
-- Panorama de perda — Mila classifica cada conversa fechada/perdida com motivo
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists mila_analise_perda (
  id uuid primary key default gen_random_uuid(),
  chat_clint_id text not null references clint_chats(clint_id) on delete cascade,
  contato_clint_id text references clint_contatos(clint_id) on delete cascade,
  vendedor_clint_id text,
  desfecho text check (desfecho in ('fechado', 'perdido', 'em_andamento')),
  motivo_principal text check (motivo_principal in (
    'atendimento_demorado',
    'vendedora_sumiu',
    'erro_comercial',
    'preco_alto',
    'fora_do_escopo',
    'vou_pensar',
    'foi_pra_concorrencia',
    'prazo_nao_bateu',
    'sem_motivo_claro',
    'fechado_com_sucesso',
    'em_andamento'
  )),
  motivos_secundarios jsonb default '[]'::jsonb,
  resumo text,
  citacoes jsonb default '[]'::jsonb,        -- trechos da conversa que evidenciam
  primeira_msg_em timestamptz,
  ultima_msg_em timestamptz,
  minutos_ate_primeira_resposta integer,      -- do cliente pra vendedora
  criada_em timestamptz default now(),
  unique(chat_clint_id)
);
create index if not exists mila_perda_desfecho_idx on mila_analise_perda(desfecho);
create index if not exists mila_perda_motivo_idx on mila_analise_perda(motivo_principal);
create index if not exists mila_perda_vendedor_idx on mila_analise_perda(vendedor_clint_id);

-- View útil pro admin dashboard
create or replace view leads_resumo as
select
  l.*,
  (select count(*) from messages m where m.lead_id = l.id) as total_mensagens,
  (select count(*) from orcamentos o where o.lead_id = l.id) as total_orcamentos,
  (select max(valor_referencia) from orcamentos o where o.lead_id = l.id) as ultimo_valor_orcado,
  (select count(*) from visitas v where v.lead_id = l.id and v.status = 'agendada') as visitas_agendadas
from leads l;
