# Dashboard WhatsApp em Tempo Real

Dashboard ao vivo do volume de mensagens trocadas com um assistente WhatsApp automatizado. As métricas são populadas por um workflow n8n que intermedia a Meta Cloud API, um agente OpenAI e o Supabase — e o frontend assina as inserções via Supabase Realtime.

Projeto pensado como portfólio: o schema do banco armazena **apenas timestamp e direção da mensagem**, sem texto, nome ou número, então o dashboard pode ficar público sem expor conteúdo de conversa.

## Stack

- **Frontend:** Vite, React 19, TypeScript, Tailwind CSS v4, Recharts, lucide-react
- **Backend:** Supabase (Postgres + Realtime + RLS)
- **Automação:** n8n (WhatsApp Trigger, OpenAI Agent, Postgres Chat Memory, HTTP Request)
- **Deploy:** Vercel

## Schema

```sql
CREATE TABLE public.historico_mensagem (
  id BIGSERIAL PRIMARY KEY,
  who_sent TEXT NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historico_mensagem_who_sent_check CHECK (who_sent IN ('bot', 'client'))
);
```

`CHECK` constraint blinda o domínio em duas opções — o workflow não consegue inserir valor fora do esperado mesmo com bug. Sem coluna de texto, há zero PII em repouso.

A leitura é pública via RLS (`USING (true)`); a escrita só acontece via `service_role` (n8n), nunca via anon key.

## Métricas exibidas

- **Cards:** mensagens hoje (com variação % vs ontem), respostas enviadas pelo bot, total dos últimos 7 dias, total geral (últimas 1000)
- **Gráfico 14 dias:** área dupla separando recebidas vs enviadas
- **Gráfico horário:** distribuição do dia atual em barras
- **Feed ao vivo:** últimas 15 inserções com badge `BOT`/`CLIENTE` e horário — conteúdo é exibido como "Conteúdo protegido" porque, por design, ele nem sai do banco

## Rodando localmente

```bash
git clone https://github.com/danielcordazzocorrea/whatsapp-insights.git
cd whatsapp-insights
bun install
cp .env.example .env   # preencha com as credenciais do seu projeto Supabase
bun dev
```

Aplique a migration em `supabase/migrations/` no SQL Editor do Supabase (ou via `supabase db push` se usar a CLI).

## Workflow n8n

O export do workflow está em `N8N/AI_assistant.json`. Antes de importar:

1. Substitua `<META_PHONE_NUMBER_ID>` no nó **HTTP Request** pelo `phone_number_id` do seu número WhatsApp Business.
2. Religue as credenciais (n8n não exporta segredos):
   - `whatsAppTriggerApi` — OAuth do app Meta
   - `supabaseApi` — service_role key
   - `openAiApi` — API key da OpenAI
   - `postgres` — Postgres da memória do agente
   - `httpBearerAuth` — token de acesso do Graph API

## Estrutura do repositório

```
.
├── N8N/                       # Workflow exportado do n8n
├── src/
│   ├── integrations/supabase/ # Cliente + types gerados
│   ├── pages/Index.tsx        # Dashboard
│   └── components/ui/         # Componentes shadcn-ui
├── supabase/
│   ├── config.toml
│   └── migrations/            # Schema versionado
└── vite.config.ts
```

## Licença

MIT
