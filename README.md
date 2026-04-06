# 🌿 Mostarda Restaurant Agent — Backend

Sistema de agente IA para restaurantes via WhatsApp  
**Mostarda 369Hz** — by Junior Barbarossa

---

## Stack
- **Node.js** + Express
- **Claude API** (Anthropic) — o cérebro do agente
- **Supabase** — banco de dados
- **Meta Cloud API** — WhatsApp oficial
- **Railway** — deploy

---

## Setup local

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
# Edita o .env com seus valores
```

### 3. Rodar o banco no Supabase
- Acesse supabase.com e crie um projeto
- Vá em SQL Editor
- Cole e execute o arquivo `schema.sql`

### 4. Rodar localmente
```bash
npm run dev
```

---

## Deploy no Railway

### 1. Instalar Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### 2. Criar projeto
```bash
railway init
railway up
```

### 3. Configurar variáveis no Railway
No painel do Railway → Variables:
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
META_VERIFY_TOKEN=mostarda_webhook_secret_2024
META_APP_SECRET=xxx
PORT=3000
```

### 4. Pegar a URL pública
Railway gera uma URL como: `https://seu-app.railway.app`

---

## Configurar o Webhook na Meta

1. Acesse **Meta for Developers** → seu app → WhatsApp → Configuration
2. Em **Webhook URL**: `https://seu-app.railway.app/webhook/whatsapp`
3. Em **Verify Token**: o valor de `META_VERIFY_TOKEN` do seu .env
4. Clique **Verify and Save**
5. Ative os campos: `messages`

---

## Configurar cada restaurante no Supabase

Após criar o restaurante no banco, atualize o campo `config_meta_api`:

```sql
update restaurantes
set config_meta_api = '{
  "phone_number_id": "SEU_PHONE_NUMBER_ID",
  "waba_id": "SEU_WABA_ID",
  "access_token": "SEU_ACCESS_TOKEN"
}'
where nome = 'Nome do Restaurante';
```

---

## Estrutura de arquivos

```
src/
├── index.js              — servidor principal
├── agents/
│   └── agente.js         — lógica do agente IA (Claude)
├── routes/
│   ├── webhook.js        — recebe mensagens do WhatsApp
│   └── api.js            — API REST para o dashboard
└── services/
    ├── restaurante.js    — serviços de DB (todos)
    ├── whatsapp.js       — envio de mensagens Meta API
    └── cron.js           — tarefas automáticas
config/
└── index.js              — Supabase + Anthropic clients
```

---

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Health check |
| GET | `/webhook/whatsapp` | Verificação Meta |
| POST | `/webhook/whatsapp` | Recebe mensagens |
| GET | `/api/restaurantes` | Lista restaurantes |
| POST | `/api/restaurantes` | Cria restaurante |
| GET | `/api/restaurantes/:id/stats` | Stats do dashboard |
| GET | `/api/restaurantes/:id/clientes` | Lista clientes |
| GET | `/api/restaurantes/:id/pedidos` | Lista pedidos |
| GET | `/api/restaurantes/:id/reservas` | Lista reservas |
| GET | `/api/restaurantes/:id/campanhas` | Lista campanhas |
| GET | `/api/restaurantes/:id/reclamacoes` | Lista reclamações |

---

## Tarefas automáticas (Cron)

| Horário | Tarefa |
|---------|--------|
| Todo dia às 9h | Mensagens de aniversário |
| A cada 2h | Follow-up carrinho abandonado |
| A cada 5min | Campanhas agendadas |

---

## Próximos passos

- [ ] Integração Instagram (Direct + Comentários)
- [ ] Upload de imagens para produtos
- [ ] Webhook de status de pedido (notifica cliente)
- [ ] Painel de análise avançada
