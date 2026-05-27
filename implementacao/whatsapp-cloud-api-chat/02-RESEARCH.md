# 02 — Research

Pesquisa técnica e decisões de arquitetura. Documenta **por que** as escolhas foram feitas — o "what" está nas fases.

---

## 1. Modelo de App Meta: único SaaS vs. um por empresa

### Problema

A WhatsApp Cloud API exige um "App Meta" com credenciais próprias (App ID, App Secret, Verify Token). Em um sistema SaaS multi-tenant como este, há duas estratégias: um único App Meta compartilhado por todas as empresas clientes (gerenciado pelo SaaS) ou cada empresa traz seu próprio App Meta.

### Opções avaliadas

| Opção | Prós | Contras | Veredito |
|-------|------|---------|----------|
| A: App Meta único SaaS (gerenciado pelo sistema) | Uma só config; onboarding automático via Embedded Signup; um App Secret para validar todas as assinaturas | Exige Embedded Signup (OAuth), revisão de App pelo Meta, termos de parceiro; App Secret vazado compromete TODAS as empresas; mais complexo para aprovação Meta | ❌ descartada |
| B: App Meta por empresa (cada empresa traz o próprio) | Isolamento total de credenciais; App Secret e Verify Token por empresa; sem dependência de aprovação SaaS; simples de entender | Onboarding manual (empresa precisa criar App Meta próprio); sem Embedded Signup nesta fase | ✅ escolhida |

### Decisão

Cada empresa configura seu próprio App Meta, fornecendo manualmente Phone Number ID, WABA ID, Access Token, App Secret e Verify Token. O webhook único identifica a empresa pelo `metadata.phone_number_id` do payload e busca o App Secret correto para validar a assinatura.

Embedded Signup (fluxo OAuth automático) fica documentado como decisão em aberto para fase futura — não é bloqueante para o produto atual.

### Referências

- https://developers.facebook.com/docs/whatsapp/cloud-api/get-started — primeiros passos, criação de App
- https://developers.facebook.com/docs/whatsapp/embedded-signup — Embedded Signup (futuro)

---

## 2. Armazenamento de credenciais Meta: tabela Options vs. tabela dedicada

### Problema

O sistema já possui a tabela `Options` (chave-valor por empresa) usada para configurações diversas. A questão é se as credenciais Meta devem ir para lá ou para uma tabela dedicada.

### Opções avaliadas

| Opção | Prós | Contras | Veredito |
|-------|------|---------|----------|
| A: Tabela `Options` (chave-valor existente) | Sem migration adicional; padrão já usado no sistema | Sem tipagem; sem índice por `phone_number_id`; lookup O(n) no webhook (buscar todas as empresas para resolver o tenant); campo de credenciais misturado com outras configs | ❌ descartada |
| B: Tabela `WhatsappCloudConfig` dedicada | Índice único por `phone_number_id` → lookup O(1) no webhook; colunas tipadas e documentadas; isolamento claro de segurança; constraint UNIQUE para evitar duplicata | Requer migration adicional | ✅ escolhida |

### Decisão

Tabela `WhatsappCloudConfig` com as colunas: `id`, `empresa_id` (FK para empresas), `phone_number_id` (UNIQUE, índice), `waba_id`, `access_token`, `app_secret`, `verify_token`, `graph_api_version` (default `v23.0`), `ativo` (boolean, default TRUE), `created_at`, `updated_at`. Todas as colunas nullable exceto `empresa_id` e `phone_number_id`, conforme padrão do projeto.

O `phone_number_id` indexado é crítico: o webhook POST recebe dezenas/centenas de mensagens por segundo e precisa resolver o tenant em microssegundos.

### Referências

- `server/src/routes/config.js` — padrão atual de uso da tabela Options
- Padrão do projeto: CLAUDE.md — "SEMPRE QUE CRIAR COLUNAS/TABELAS, CRIE NULLABLE"

---

## 3. Segurança do token de acesso Meta: texto puro vs. criptografado

### Problema

O `access_token` da Cloud API concede acesso total à conta WhatsApp Business da empresa. Armazená-lo em texto puro no banco significa que qualquer vazamento do banco compromete diretamente a conta WhatsApp.

### Opções avaliadas

| Opção | Prós | Contras | Veredito |
|-------|------|---------|----------|
| A: Texto puro | Simples; sem overhead de decriptação; fácil de depurar | Vazamento de banco = vazamento de credenciais Meta; risco real | ✅ escolhida (decisão explícita do usuário) |
| B: Criptografia simétrica (AES-256) com chave em variável de ambiente | Token ilegível no banco; requer comprometimento simultâneo do banco + env | Implementação adicional; chave em env (ainda assim, comprometimento do servidor expõe tudo) | ❌ descartada (nesta SPEC) |
| C: KMS / secrets manager externo | Máxima segurança | Infraestrutura adicional; custo; complexidade significativa | ❌ descartada (fora do escopo) |

### Decisão

**Texto puro — RISCO ACEITO EXPLICITAMENTE PELO USUÁRIO durante o discovery (2026-05-27).**

Mitigações mínimas obrigatórias:
1. O endpoint `GET /zap/config` NUNCA retorna o campo `access_token`, `app_secret` ou `verify_token` — apenas metadados (`phone_number_id`, `waba_id`, `ativo`).
2. O frontend exibe o campo de token como `type="password"` e NÃO pré-preenche com o valor salvo.
3. Logs do servidor NUNCA imprimem o token (sanitizar antes de logar).
4. Documentar o risco no README do módulo e no formulário de credenciais (UI).

Criptografia em repouso fica como decisão em aberto para implementação futura.

---

## 4. Persistência própria de mensagens: obrigatoriedade e modelo

### Problema

O wwebjs fornece `client.getChats()` e `chat.fetchMessages()` — o chat lê ao vivo. A Cloud API não entrega histórico; apenas entrega mensagens em tempo real via webhook. Sem persistência própria, o histórico some ao reiniciar o processo.

### Decisão

Persistência própria é **obrigatória e não negociável**. Duas tabelas novas:

**`Conversations`**
```
id              INT PK AUTO_INCREMENT
empresa_id      INT NOT NULL (FK)
phone_number_id VARCHAR(50) NOT NULL (phone Meta da empresa)
customer_phone  VARCHAR(30) NOT NULL (E.164 sem '+', ex: 5541999999999)
customer_name   VARCHAR(255) NULL
last_inbound_at DATETIME NULL (atualizado a cada mensagem do cliente — controla janela 24h)
unread_count    INT DEFAULT 0
created_at      DATETIME
updated_at      DATETIME
UNIQUE KEY (empresa_id, customer_phone)
```

**`Messages`**
```
id              BIGINT PK AUTO_INCREMENT
conversation_id INT NOT NULL (FK → Conversations.id)
empresa_id      INT NOT NULL (denormalizado para queries diretas)
wamid           VARCHAR(255) NULL UNIQUE (ID Meta — usado para status updates e reply context)
direction       ENUM('inbound','outbound') NOT NULL
msg_type        ENUM('text','image','audio','document','video','sticker','template','unknown') DEFAULT 'text'
body            TEXT NULL (texto da mensagem ou caption)
media_url       VARCHAR(500) NULL (path local em /uploads/midias/ ou URL)
media_mime      VARCHAR(100) NULL
media_filename  VARCHAR(255) NULL
status          ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending'
error_data      JSON NULL (dados de erro da Cloud API)
reply_to_wamid  VARCHAR(255) NULL (wamid da mensagem citada)
sender_name     VARCHAR(255) NULL (nome do atendente ou do cliente)
timestamp_ms    BIGINT NULL (timestamp Unix ms da mensagem)
created_at      DATETIME
updated_at      DATETIME
INDEX idx_conversation_id (conversation_id)
INDEX idx_empresa_wamid (empresa_id, wamid)
```

---

## 5. Versão da Graph API a fixar

### Problema

A Meta lança novas versões da Graph API periodicamente (v17, v18, … v25) e depreca versões antigas. Hardcodar a versão no código exige um deploy para trocar.

### Decisão

Fixar `v23.0` como padrão inicial (versão usada nos exemplos oficiais de 2025/2026 no momento desta SPEC). Armazenar em:

1. Variável de ambiente `GRAPH_API_VERSION=v23.0` (lida no módulo cliente Cloud API).
2. Campo `graph_api_version` na tabela `WhatsappCloudConfig` como override por empresa (default `v23.0`).

Prioridade: campo da empresa > variável de ambiente. Isso permite testar uma versão nova em uma empresa sem afetar as demais.

### Referências

- https://developers.facebook.com/docs/graph-api/guides/versioning — ciclo de versões (mínimo 2 anos por versão)
- Versão atual (2026): v25.0 disponível; v23.0 ainda suportada e estável

---

## 6. Validação de assinatura: raw body obrigatório

### Problema

O Express, por padrão com `express.json()`, consome e parseia o body antes que o handler o veja. A validação HMAC-SHA256 exige o **raw body bytes** — qualquer modificação (reordenação de chaves JSON, espaços) invalida o HMAC.

### Decisão

Configurar `express.json()` com o callback `verify` para salvar o raw body antes do parse:

```js
// Deve ser aplicado ANTES de qualquer outro middleware JSON
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // Buffer com bytes originais
  }
}));
```

A rota `POST /webhook/whatsapp` usa `req.rawBody` para validar a assinatura antes de qualquer processamento do payload. Se o raw body não estiver disponível (ex: `Content-Type` diferente), rejeitar com 400.

Comparação **timing-safe** obrigatória:
```js
const crypto = require('crypto');
const sig = Buffer.from(req.headers['x-hub-signature-256'].replace('sha256=', ''), 'hex');
const expected = crypto.createHmac('sha256', appSecret).update(req.rawBody).digest();
if (!crypto.timingSafeEqual(sig, expected)) return res.status(403).end();
```

### Referências

- https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads — validação de assinatura

---

## 7. Fatos técnicos da Cloud API Meta

### 7.1 Endpoints principais

| Ação | Método | URL |
|------|--------|-----|
| Enviar mensagem | POST | `https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}/messages` |
| Upload de mídia | POST | `https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}/media` |
| Buscar URL de mídia | GET | `https://graph.facebook.com/{API_VERSION}/{MEDIA_ID}` |
| Baixar mídia | GET | URL retornada pelo passo anterior (com Bearer token) |
| Listar templates | GET | `https://graph.facebook.com/{API_VERSION}/{WABA_ID}/message_templates` |
| Marcar como lido | POST | `https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}/messages` (body: `status:"read"`) |

Todas as chamadas autenticadas: `Authorization: Bearer {ACCESS_TOKEN}`.

### 7.2 Webhook — Handshake (GET)

```
GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
```

Lógica:
1. Buscar `WhatsappCloudConfig` com `verify_token = hub.verify_token` (busca em todas as empresas).
2. Se encontrado e `hub.mode === 'subscribe'`: responder `200` com `hub.challenge` em **texto puro** (`res.status(200).send(hub.challenge)`).
3. Caso contrário: `403`.

### 7.3 Webhook — Payload POST

Estrutura canônica:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "...", "phone_number_id": "PHONE_NUMBER_ID" },
        "contacts": [{ "profile": { "name": "Nome" }, "wa_id": "5541999999999" }],
        "messages": [{
          "id": "wamid.xxx",
          "from": "5541999999999",
          "timestamp": "1700000000",
          "type": "text",
          "text": { "body": "Olá" },
          "context": { "message_id": "wamid.yyy" }
        }],
        "statuses": [{
          "id": "wamid.xxx",
          "recipient_id": "5541999999999",
          "status": "delivered",
          "timestamp": "1700000001",
          "conversation": { "expiration_timestamp": "1700086400" },
          "errors": []
        }]
      }
    }]
  }]
}
```

Roteamento: `value.metadata.phone_number_id` → `WhatsappCloudConfig` → `empresa_id`.

### 7.4 Envio de mensagens — corpos

**Texto:**
```json
{ "messaging_product": "whatsapp", "to": "5541999999999", "type": "text", "text": { "body": "Olá", "preview_url": false } }
```

**Imagem (por link):**
```json
{ "messaging_product": "whatsapp", "to": "...", "type": "image", "image": { "link": "https://...", "caption": "..." } }
```

**Documento (por ID de upload):**
```json
{ "messaging_product": "whatsapp", "to": "...", "type": "document", "document": { "id": "MEDIA_ID", "filename": "arquivo.pdf", "caption": "..." } }
```

**Áudio (por ID de upload):**
```json
{ "messaging_product": "whatsapp", "to": "...", "type": "audio", "audio": { "id": "MEDIA_ID" } }
```

**Reply (com contexto):**
```json
{ "...", "context": { "message_id": "wamid.yyy" }, "type": "text", "text": { "body": "..." } }
```

**Marcar como lido:**
```json
{ "messaging_product": "whatsapp", "status": "read", "message_id": "wamid.xxx" }
```

**Template:**
```json
{
  "messaging_product": "whatsapp", "to": "...", "type": "template",
  "template": {
    "name": "hello_world",
    "language": { "code": "pt_BR" },
    "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "João" }] }]
  }
}
```

**Formato do número:** E.164 sem `+` (ex: `5541999999999`).

### 7.5 Janela de 24 horas

- **Regra:** cliente envia mensagem → abre janela de 24h; cada nova mensagem do cliente reinicia a janela.
- **Fora da janela:** mensagens de texto livre retornam erro `131047` (re-engagement template needed).
- **Controle local:** persistir `last_inbound_at` na tabela `Conversations`; calcular `janela_ativa = (NOW() - last_inbound_at) < 24h`.
- **`conversation.expiration_timestamp`** nos webhooks de status: usar como referência adicional (UTC Unix).
- **UX:** bloquear input de texto na UI quando `janela_ativa = false`; exibir botão "Enviar Template".

### 7.6 Mídia — download de inbound

```
1. GET https://graph.facebook.com/{API_VERSION}/{MEDIA_ID}
   Authorization: Bearer {ACCESS_TOKEN}
   → { "url": "https://lookaside.fbsbx.com/...", "mime_type": "image/jpeg", "id": "..." }

2. GET {url retornada}
   Authorization: Bearer {ACCESS_TOKEN}
   → bytes binários da mídia (salvar em /uploads/midias/{empresa_id}/{uuid}.{ext})
```

A URL expira em minutos — fazer o download imediatamente ao receber o webhook.

### 7.7 Mídia — upload de outbound

```
POST https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}/media
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: multipart/form-data
  messaging_product=whatsapp
  type=image/jpeg (MIME)
  file=<binário do arquivo>
→ { "id": "MEDIA_ID" }
```

O `MEDIA_ID` retornado fica disponível por 30 dias. Usar o ID no envio de mensagem.

### 7.8 Listagem de templates

```
GET https://graph.facebook.com/{API_VERSION}/{WABA_ID}/message_templates
  ?fields=name,status,category,language,components
  &status=APPROVED
  &limit=100
Authorization: Bearer {ACCESS_TOKEN}
→ { "data": [...], "paging": { "cursors": {...}, "next": "..." } }
```

Filtrar somente `status === 'APPROVED'` antes de retornar ao frontend.

### 7.9 Erros relevantes

| Código | Descrição | Ação sugerida |
|--------|-----------|---------------|
| 131047 | Re-engagement: janela 24h fechada, somente template | Bloquear texto livre na UI; oferecer template |
| 131026 | Mensagem não entregável (número inválido ou bloqueou) | Logar; informar atendente |
| 131056 | Pair rate limit | Retry com backoff exponencial |
| 190 | Token inválido ou expirado | Alertar admin para renovar token |
| 132001 | Template inexistente ou não aprovado | Recarregar lista de templates |
| 132000 | Número incorreto de parâmetros no template | Corrigir componentes enviados |
| 100 | Parâmetro inválido (ex: `phone_number_id` errado) | Verificar configuração |
| 80007 | Rate limit geral | Backoff + alerta |

### 7.10 Limites e throughput

- Throughput padrão: 80 mensagens/segundo por número.
- Conversas business-initiated: tier inicial = 250 conversas únicas/24h; sobe para 1k, 10k, 100k, ilimitado conforme qualidade.
- Mensagens inbound (customer-initiated): sem limite explícito por tier.

---

## Padrões aplicáveis

### Backend

- **CommonJS (`require`)** — padrão do projeto; sem ESM imports
- **Módulo isolado `server/src/whatsapp/`** — novo diretório para o módulo Cloud API, espelhando a estrutura atual de `server/src/zap/`; subarchivos: `client.js` (envio HTTP), `webhook.js` (handler), `media.js` (download/upload), `templates.js` (listagem), `config.js` (CRUD credenciais)
- **`express.json({ verify: saveRawBody })`** — deve ser o PRIMEIRO middleware de parse JSON na aplicação para garantir que `req.rawBody` esteja disponível no webhook
- **`crypto.timingSafeEqual`** — obrigatório para comparação de HMAC (previne timing attacks)
- **Funções comentadas com JSDoc** — padrão do projeto
- **Retry com backoff exponencial** — para erros 131056 e 80007 da Cloud API
- **Nunca logar tokens/secrets** — sanitizar objetos de config antes de qualquer `console.log` ou logger

### Frontend

- **Vuexy + Vuetify + Tabler icons** — sem criar componentes fora desse ecossistema
- **`<AppDrawerHeaderSection>`** em dialogs no lugar de `<VCardTitle>`
- **Dialogs**: `<VDialog> > <VCard> > <VCardText> > <AppDrawerHeaderSection>`, botões em `<div>` sem `<VCardActions>`
- **Campo de token**: `<VTextField type="password" autocomplete="new-password">` sem valor pré-preenchido
- **Indicadores de janela 24h**: componente visual claro (chip colorido + countdown) na cabeça do chat

### Dados

- **Todas as colunas novas NULLABLE** (padrão do projeto — CLAUDE.md)
- **Índice `phone_number_id`** em `WhatsappCloudConfig` — lookup O(1) no webhook
- **Índice `(empresa_id, customer_phone)` UNIQUE** em `Conversations` — evita duplicatas e acelera busca
- **Índice `(empresa_id, wamid)`** em `Messages` — lookup de status update
- **`wamid` UNIQUE** em `Messages` — garante idempotência: mesmo wamid recebido duas vezes não duplica

---

## Trade-offs explícitos

- **Segurança vs. Simplicidade (token):** escolhemos texto puro porque a implementação de criptografia adiciona complexidade sem eliminar o risco de comprometimento do servidor (chave em env); decisão explícita do usuário com ciência do risco
- **App por empresa vs. App único SaaS:** escolhemos por empresa porque elimina a necessidade de Embedded Signup e aprovação de parceiro Meta nesta fase; trade-off: onboarding manual mais trabalhoso
- **Tabela dedicada vs. Options:** escolhemos tabela dedicada pelo índice em `phone_number_id`; trade-off: migration adicional, compensado amplamente pela performance do webhook
- **Persistência própria vs. leitura ao vivo:** obrigatório pela natureza da Cloud API; trade-off: complexidade de sync, compensado pela resiliência a restarts e histórico garantido
- **Versão configurável vs. fixada:** escolhemos configurável porque o Meta depreca versões; trade-off: mínima complexidade adicional, alta proteção contra breaking changes futuros

---

## Decisões que ficaram em aberto

- **Embedded Signup** — implementação futura de onboarding OAuth automático para empresas; quem decide: Janderson; sem deadline definido
- **Criptografia do access_token em repouso** — implementar AES-256 com chave em variável de ambiente; quem decide: Janderson; recomendado fazer após estabilização da migração
- **Migração de histórico wwebjs** — se necessário preservar conversas antigas, precisaria de export manual do wwebjs antes do desligamento; quem decide: Janderson; deadline: antes da FASE-05

---

## Referências

- https://developers.facebook.com/docs/whatsapp/cloud-api/ — documentação principal Cloud API
- https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks — Webhooks (GET handshake + POST payload)
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages — Reference Messages (envio)
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media — Reference Media (upload/download)
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates — Send Message Templates
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/get-message-delivery-updates — Status de entrega
- https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates — Gerenciar templates
- https://developers.facebook.com/docs/graph-api/guides/versioning — Versionamento Graph API
- https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes — Códigos de erro
- https://developers.facebook.com/docs/whatsapp/cloud-api/overview/throughput — Throughput e limites
