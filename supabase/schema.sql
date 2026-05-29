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

-- View útil pro admin dashboard
create or replace view leads_resumo as
select
  l.*,
  (select count(*) from messages m where m.lead_id = l.id) as total_mensagens,
  (select count(*) from orcamentos o where o.lead_id = l.id) as total_orcamentos,
  (select max(valor_referencia) from orcamentos o where o.lead_id = l.id) as ultimo_valor_orcado,
  (select count(*) from visitas v where v.lead_id = l.id and v.status = 'agendada') as visitas_agendadas
from leads l;
