# FASE 02 — Webhook Fixo Único

**Duração estimada:** 2h30 — 3h30  
**Dependências:** FASE-00 (`WhatsappCloudConfig`, `configRepository`), FASE-01 (`cloudApiClient`, repositórios de conversas/mensagens, `messageService.isWindowOpen`)  
**Entregável:** rota `GET /webhook/whatsapp` (handshake Meta) + rota `POST /webhook/whatsapp` (recebe mensagens e status, valida assinatura HMAC-SHA256, persiste, emite socket) — montadas SEM autenticação JWT, antes dos middlewares protegidos.

## Objetivo

Expor o endpoint público que o Meta usa para entregar mensagens e confirmações de status. A validação de assinatura HMAC-SHA256 com raw body é a peça de segurança central desta fase — sem ela, qualquer pessoa poderia injetar mensagens falsas. O roteamento multi-tenant é feito pelo `phone_number_id` do payload, e cada mensagem recebida é persistida imediatamente e emitida via socket para o frontend. É crítico que o webhook responda `200` rapidamente (o Meta reenvio se não receber `200` em < 20s) — todo processamento pesado (download de mídia) deve ser feito de forma que não bloqueie a resposta.

## Research relevante

Ver [`../02-RESEARCH.md`](../02-RESEARCH.md) seções 6 (raw body obrigatório), 7.2 (handshake GET), 7.3 (payload POST), 7.5 (janela 24h — `last_inbound_at`), 7.6 (download de mídia inbound) e 7.9 (erros).

## Subfases

> Cada subfase é construída por um subagent Sonnet 4.6 (medium effort) e validada pelo modelo da sessão. Ordem importa — não pular.

---

### Subfase A — Raw Body + Handshake GET

**O que construir:** duas mudanças:
1. Modificar o `express.json()` global em `server/src/index.js` para capturar o raw body no `req.rawBody` — necessário para validação HMAC-SHA256.
2. Criar `server/src/routes/webhook-route.js` com a rota `GET /webhook/whatsapp` (handshake Meta).

**Modificação em `server/src/index.js` (linha 24):**

Trocar:
```js
app.use(express.json({ limit: '5000mb' }));
```
Por:
```js
app.use(express.json({
  limit: '5000mb',
  verify: (req, res, buf) => {
    // Salva o raw body para validação HMAC-SHA256 do webhook do Meta
    req.rawBody = buf;
  }
}));
```

ATENÇÃO: esta modificação afeta TODOS os endpoints da aplicação — a captura do rawBody não muda o comportamento de parse do JSON para nenhuma outra rota. Apenas adiciona `req.rawBody` como Buffer disponível.

**Rota GET no `webhook-route.js`:**

```js
// GET /webhook/whatsapp — handshake de verificação do Meta
// O Meta envia: ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
// Deve responder com hub.challenge em texto puro se verify_token bater com qualquer empresa
router.get('/whatsapp', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token) {
    return res.status(403).send('Forbidden');
  }

  // Buscar empresa com esse verify_token (percorre todas as configs ativas)
  const config = await configRepository.getByVerifyToken(token);
  if (!config) {
    return res.status(403).send('Forbidden');
  }

  // Responder com o challenge em texto puro (sem JSON.stringify)
  return res.status(200).send(challenge);
});
```

Isso requer adicionar a função `getByVerifyToken(token)` ao `configRepository.js` criado na FASE-00:
```js
/**
 * Busca config pelo verify_token (usado no handshake GET do webhook).
 * @param {string} verifyToken
 * @returns {Promise<Object|null>}
 */
async function getByVerifyToken(verifyToken) { ... }
```

**Arquivos prováveis afetados:**
- `server/src/index.js` — modificar linha 24 (express.json verify callback)
- `server/src/routes/webhook-route.js` — criar (novo)
- `server/src/whatsapp/repositories/configRepository.js` — adicionar `getByVerifyToken`

**Padrões a seguir:**
- Raw body: ver [`../02-RESEARCH.md`](../02-RESEARCH.md) seção 6 — padrão exato com `verify` callback
- Rota de webhook existente como modelo: `server/src/routes/webhook-asaas.js` (rota pública, sem auth, montada em `app.use('/webhook', require('./routes/webhook-asaas'))`)
- `res.status(200).send(challenge)` — texto puro, NÃO `res.json()` (Meta valida que é texto puro)

**Checklist de segurança específico (esta subfase):**
- [ ] `verify_token` comparado com busca no banco — nunca hardcoded
- [ ] Se `hub.mode !== 'subscribe'` ou `token` vazio → responder `403` imediatamente
- [ ] `challenge` respondido em texto puro (sem JSON wrapper) — caso contrário o handshake falha no Meta
- [ ] Modificação do `express.json` não quebra nenhuma rota existente — testar com `pm2 logs` após reinício
- [ ] `getByVerifyToken` usa query parametrizada (`WHERE verify_token = ?`)

**Estratégia de teste:**
- Smoke via curl (simular handshake do Meta):
```bash
# Substituir TOKEN pelo verify_token salvo na FASE-00 Subfase C
curl -v "https://app.oregonservicos.com.br:3005/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN_AQUI&hub.challenge=abc123"
# Esperado: HTTP 200, body = abc123

# Token errado → deve retornar 403
curl -v "https://app.oregonservicos.com.br:3005/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token_errado&hub.challenge=abc123"
# Esperado: HTTP 403
```

**Critério de aceite:**
1. Handshake com `verify_token` válido retorna `200` e body `abc123` (o challenge enviado) em texto puro
2. Handshake com token inválido retorna `403`
3. PM2 boot sem erros após modificar `express.json` em `index.js`
4. Rota `POST /zap/send-message-chat` ainda responde normalmente (verificar que o rawBody não quebrou outras rotas)

**Comandos de verificação:**
```bash
# Verificar que express.json foi modificado
grep -n "rawBody\|verify:" /var/www/public-oregon/server/src/index.js

# Handshake simulado (ajustar TOKEN)
curl -s "https://app.oregonservicos.com.br:3005/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=SUA_VERIFY_TOKEN&hub.challenge=TESTE123"

# PM2 sem erros
pm2 logs oregon-node-dev --lines 20 --nostream
```

**Riscos específicos:**
- `express.json` modificado na linha 24 afeta raw body de TODAS as rotas — se existir algum endpoint que enviava body como buffer raw (ex: upload) e verificava `Content-Type: application/json`, pode comportar-se diferente → verificar `server/src/routes/upload-files.js` e outras rotas de upload; em geral uploads usam `multipart/form-data` e não passam pelo `express.json`
- `express.urlencoded` na linha 25 não precisa de modify — o raw body do webhook sempre é `application/json`
- `getByVerifyToken` precisa de índice ou é full scan — `WhatsappCloudConfig` tende a ter poucas linhas (1 por empresa); sem índice é aceitável [ASSUMPTION: número de empresas < 1000]

---

### Subfase B — POST: Assinatura + Processamento

**O que construir:** rota `POST /webhook/whatsapp` em `server/src/routes/webhook-route.js` que: valida a assinatura HMAC-SHA256, roteia para a empresa pelo `phone_number_id`, processa `messages[]` (persistência + socket) e `statuses[]` (atualização de status + socket), e responde `200` para o Meta.

Lógica completa da rota POST:

```
1. Extrair phone_number_id de entry[0].changes[0].value.metadata.phone_number_id
2. Buscar config da empresa: configRepository.getByPhoneNumberId(phoneNumberId)
   - Se não encontrada: responder 200 (evitar retry) mas logar aviso
3. Validar assinatura X-Hub-Signature-256:
   - crypto.createHmac('sha256', config.app_secret).update(req.rawBody).digest()
   - crypto.timingSafeEqual(sig, expected)
   - Se inválida: responder 401 (assinatura inválida — não logar payload)
4. Para cada entry[].changes[].value.messages[]:
   a. Upsert conversa: conversationRepository.upsertConversation({
        empresa_id, phone_number_id, contact_wa_id: msg.from,
        contact_name: contacts[0]?.profile?.name,
        last_inbound_at: new Date(),
        last_message_at: new Date(),
        last_message_preview: extrairPreview(msg),
        unread_count: <incrementar por 1>
      })
   b. Processar mídia se msg.type != 'text': getMediaUrl + downloadMedia (assíncrono — não bloquear resposta)
   c. Inserir mensagem: messageRepository.insertMessage({
        empresa_id, conversation_id: conversa.id,
        wamid: msg.id, direction: 'inbound',
        type: msg.type, body: extrairBody(msg),
        reply_to_wamid: msg.context?.message_id,
        sender_name: contacts[0]?.profile?.name,
        timestamp_ms: parseInt(msg.timestamp) * 1000,
        status: 'delivered'
      })
   d. Atualizar CLIENTES.cli_ultima_msg_cliente_data se phone bater (via REGEXP_REPLACE nos últimos 8 dígitos)
   e. emitToEmpresa(empresaId, 'nova-mensagem', { conversation_id, message: <objeto da mensagem> })
5. Para cada entry[].changes[].value.statuses[]:
   a. messageRepository.updateMessageStatusByWamid(status.id, status.status, status.errors, empresaId)
   b. emitToEmpresa(empresaId, 'update-mensagem', { wamid: status.id, status: status.status })
6. Responder 200 (sempre, após validação de assinatura bem-sucedida)
```

Funções auxiliares no mesmo arquivo:
- `extrairBody(msg)` — extrai texto de `msg.text.body` / `msg.image.caption` / `msg.document.caption` / etc.
- `extrairPreview(msg)` — gera preview truncado para `last_message_preview`

Download de mídia ASSÍNCRONO (não bloqueia o 200):
```js
// Disparar download em background — não aguardar com await
setImmediate(async () => {
  try {
    const url = await cloudApiClient.getMediaUrl(config, mediaId);
    const path = await cloudApiClient.downloadMedia(config, url.url, url.mime_type, empresaId);
    await messageRepository.updateMediaPath(msgId, path);
    emitToEmpresa(empresaId, 'update-mensagem', { id: msgId, media_path: path });
  } catch (e) {
    console.error('[webhook] Erro ao baixar mídia:', e.message);
  }
});
```

Isso requer adicionar `updateMediaPath(msgId, path)` ao `messageRepository.js`.

**Arquivos prováveis afetados:**
- `server/src/routes/webhook-route.js` — criar rota POST (no mesmo arquivo da Subfase A)
- `server/src/whatsapp/repositories/messageRepository.js` — adicionar `updateMediaPath`

**Padrões a seguir:**
- `const { emitToEmpresa } = require('../socket')` — padrão de `server/src/socket.js` linha 131
- `const crypto = require('crypto')` — nativo Node.js
- Comparação timing-safe exatamente como no research: `crypto.timingSafeEqual(sig, expected)` — ver [`../02-RESEARCH.md`](../02-RESEARCH.md) seção 6
- `try/catch` em torno de todo processamento após validação — mesmo que ocorra erro interno, responder `200` ao Meta

**Checklist de segurança específico (esta subfase):**
- [ ] Validação HMAC-SHA256 com `crypto.timingSafeEqual` — NUNCA comparação com `===` ou `Buffer.compare` simples (vulnerável a timing attack)
- [ ] `req.rawBody` deve ser `Buffer` — se for `undefined` (ex: Content-Type inesperado), rejeitar com `400` antes de tentar validar
- [ ] Se `phone_number_id` não encontrado no banco, responder `200` (evitar retry Meta) e logar com `console.warn` — NÃO logar payload completo (pode conter PII)
- [ ] Assinatura inválida → `401` (ou `403`) — NÃO processar payload
- [ ] `empresa_id` sempre inferido do `phone_number_id` via banco — nunca aceito do payload
- [ ] Download de mídia em background — `setImmediate` ou `process.nextTick` — NÃO await na rota principal
- [ ] Atualização de `CLIENTES.cli_ultima_msg_cliente_data` com query parametrizada — não interpolar o número de telefone na query
- [ ] Sem PII (nome, telefone, corpo da mensagem) nos logs de erro
- [ ] `wamid` de idempotência: se `insertMessage` retornar `null` (wamid duplicado), não emitir socket duplicado

**Estratégia de teste:**
- Smoke via curl com payload simulado e assinatura calculada:
```bash
# Payload de teste
PAYLOAD='{"object":"whatsapp_business_account","entry":[{"id":"WABAID","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"5541999999999","phone_number_id":"TEST_PID"},"contacts":[{"profile":{"name":"Teste"},"wa_id":"5541000000001"}],"messages":[{"id":"wamid.test001","from":"5541000000001","timestamp":"1700000000","type":"text","text":{"body":"Olá teste webhook"}}]}}]}]}'

# Calcular assinatura com app_secret da FASE-00 (substituir APP_SECRET)
APP_SECRET="SEU_APP_SECRET"
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" | cut -d' ' -f2)

curl -X POST https://app.oregonservicos.com.br:3005/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$PAYLOAD"
# Esperado: HTTP 200

# Assinatura inválida → 401
curl -X POST https://app.oregonservicos.com.br:3005/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=assinaturainvalida" \
  -d "$PAYLOAD"
# Esperado: HTTP 401
```

- Verificar persistência no banco:
```bash
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, contact_wa_id, last_inbound_at, unread_count FROM Conversations ORDER BY id DESC LIMIT 3;"
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, wamid, direction, type, body, status FROM Messages ORDER BY id DESC LIMIT 5;"
```

**Critério de aceite:**
1. POST com assinatura válida retorna `200` e persiste mensagem em `Messages`
2. POST com assinatura inválida retorna `401`
3. POST idempotente: mesmo wamid enviado duas vezes cria apenas 1 linha em `Messages`
4. Socket `nova-mensagem` emitido (verificar via frontend conectado ou log do socket)
5. POST com `statuses[]` (update de entrega) atualiza o campo `status` em `Messages`

**Comandos de verificação:**
```bash
# Após smoke test com payload de texto
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, wamid, direction, body, status FROM Messages ORDER BY id DESC LIMIT 3;"

mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, contact_wa_id, last_inbound_at, unread_count FROM Conversations ORDER BY id DESC LIMIT 3;"

pm2 logs oregon-node-dev --lines 30 --nostream
```

**Riscos específicos:**
- `req.rawBody` undefined se o request não passou pelo `express.json` com o verify callback (ex: Content-Type diferente de `application/json`) → verificar e retornar `400 Bad Request`
- `crypto.timingSafeEqual` lança exceção se os Buffers têm tamanho diferente (ex: assinatura malformada no header) → usar `try/catch` em torno da comparação; qualquer exceção = assinatura inválida
- `phone_number_id` ausente no payload (payload malformado) → encapsular extração em try/catch; logar e responder `200` (não crashar)
- Download de mídia em `setImmediate` pode falhar silenciosamente → garantir `try/catch` dentro do callback; logar erro sem PII

---

### Subfase C — Montagem da Rota Sem Auth

**O que construir:** registrar `webhook-route.js` em `server/src/index.js` ANTES do middleware de auth JWT e verificar que o raw body não quebra as demais rotas.

**Modificação em `server/src/index.js`:**

Adicionar ANTES da linha que registra `/conta` (primeira rota — linha ~81) ou logo após o bloco de middlewares iniciais (após linha 37 onde está o `express.static`):

```js
// Webhook do WhatsApp Cloud API — SEM autenticação JWT (Meta chama diretamente)
// DEVE ser registrado ANTES de qualquer middleware de auth
app.use('/webhook', require('./routes/webhook-route'));
```

[ASSUMPTION: a linha `app.use('/webhook', require('./routes/webhook-asaas'))` já existe na linha 117 do `index.js` — o novo `webhook-route` deve ser registrado na mesma prefix `/webhook`, mas o handler de `/whatsapp` é diferente do Asaas. Verificar se há conflito de path; se necessário usar prefix `/webhook` no mesmo arquivo ou criar arquivo separado. A forma mais limpa é um único `webhook-route.js` que exporta ambas as rotas Asaas + WhatsApp, ou manter dois arquivos distintos e registrar ambos em `/webhook`.]

Verificação de que o raw body não quebrou outras rotas:

```bash
# Testar rota de login (não usa rawBody, mas passa pelo express.json)
curl -X POST https://app.oregonservicos.com.br:3005/conta/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a23comunicacoes@gmail.com","password":"teste","rememberMe":false}'
# Esperado: JSON com accessToken

# Testar rota de config (autenticada, usa express.json)
curl -X GET https://app.oregonservicos.com.br:3005/whatsapp/config \
  -H "Authorization: Bearer SEU_TOKEN"
# Esperado: JSON com phone_number_id, webhook_url
```

Se o projeto tiver rate-limit middleware global, verificar se ele se aplica ao webhook — se sim, garantir que o limite é suficientemente alto para não bloquear o Meta (o Meta pode enviar rajadas de 80 msg/s). [ASSUMPTION: não há rate-limit middleware global no projeto; `server/src/index.js` não importa `express-rate-limit` ou similar — verificar com `grep -n "rate" /var/www/public-oregon/server/src/index.js`]

**Arquivos prováveis afetados:**
- `server/src/index.js` — adicionar registro da rota webhook-route

**Padrões a seguir:**
- Padrão de rota pública existente: `app.use('/webhook', require('./routes/webhook-asaas'))` (linha 117 do `index.js`) — sem `getUserLoggedUser`
- O novo `webhook-route.js` deve exportar um Express Router (como `webhook-asaas.js`)

**Checklist de segurança específico (esta subfase):**
- [ ] `/webhook/whatsapp` NÃO tem `getUserLoggedUser` no middleware chain — o Meta não envia JWT
- [ ] `/webhook/whatsapp` NÃO está exposto na lista de rotas autenticadas — não há bypass acidental do auth
- [ ] Rate-limit do webhook (se existir globalmente): garantir que não bloqueia o Meta em rajadas altas (80 msg/s por número)
- [ ] Verificar que a modificação do `express.json` não gerou erro no boot do PM2 após restart

**Estratégia de teste:**
- Verificar ordem de registro das rotas:
```bash
grep -n "webhook\|getUserLoggedUser\|express.json" /var/www/public-oregon/server/src/index.js
```
- Smoke end-to-end: handshake GET + POST com assinatura válida + verificar banco

**Critério de aceite:**
1. `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=X` retorna `X` sem autenticação
2. `POST /webhook/whatsapp` sem `Authorization` header com assinatura válida retorna `200`
3. Rota `/conta/login` ainda funciona (raw body não quebrou)
4. PM2 `online` sem exceções no log após restart

**Comandos de verificação:**
```bash
# Verificar ordem no index.js
grep -n "webhook\|getUserLogged\|express\.json\|rawBody" /var/www/public-oregon/server/src/index.js

# Handshake final (com token real da FASE-00)
curl -s "https://app.oregonservicos.com.br:3005/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=VERIFY_TOKEN&hub.challenge=challenge_abc"

# Login ainda funciona
curl -s -X POST https://app.oregonservicos.com.br:3005/conta/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a23comunicacoes@gmail.com","password":"teste","rememberMe":false}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if 'accessToken' in d else 'ERRO')"

pm2 status oregon-node-dev
```

**Riscos específicos:**
- Conflito de path `/webhook` com `webhook-asaas.js` existente → ambos podem coexistir no mesmo prefix `/webhook` desde que os sub-paths sejam distintos (`/asaas` vs. `/whatsapp`); verificar a estrutura do `webhook-asaas.js` atual
- Ordem de registro: se o novo `webhook-route.js` for registrado APÓS o middleware de auth, chamadas do Meta sem JWT serão rejeitadas → garantir que está ANTES

---

## Critério de aceite da fase (validado depois de TODAS as subfases)

1. `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN_VALIDO&hub.challenge=abc` retorna `200` com body `abc` (texto puro)
2. `POST /webhook/whatsapp` com payload de mensagem de texto e assinatura HMAC-SHA256 correta retorna `200` e persiste a mensagem em `Messages` com `direction='inbound'`
3. `POST /webhook/whatsapp` com assinatura incorreta retorna `401` e NÃO persiste nenhuma linha
4. Mesmo wamid enviado duas vezes cria apenas 1 linha em `Messages` (idempotência)
5. Socket `nova-mensagem` visível no frontend (ou confirmado via log do socket handler)
6. `POST /conta/login` ainda funciona (raw body não quebrou o express.json para outras rotas)

## Riscos da fase

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Raw body modification quebra rotas existentes (uploads, pagamentos) | Alto | Testar login + send-message-chat logo após modificar express.json; o verify callback é read-only (não altera o body) |
| Meta reenvia webhook se não receber 200 em < 20s | Alto | Responder 200 imediatamente após validação de assinatura; download de mídia em setImmediate (não bloqueia) |
| Payload malformado do Meta (campo ausente) gera exceção não tratada | Médio | Encapsular toda extração de campos em try/catch; responder 200 mesmo em caso de erro interno pós-validação |
| `crypto.timingSafeEqual` com buffers de tamanho diferente lança exceção | Médio | try/catch em torno da comparação; qualquer exceção = 401 |
| Download de mídia falha silenciosamente em background | Baixo | try/catch com console.error no setImmediate; mensagem fica sem media_path mas não quebra o chat |

## Comandos de verificação da fase

```bash
# Estrutura final do webhook-route.js
cat /var/www/public-oregon/server/src/routes/webhook-route.js | head -20

# Ordem de registro no index.js
grep -n "webhook\|getUserLogged" /var/www/public-oregon/server/src/index.js

# Handshake GET
curl -s "https://app.oregonservicos.com.br:3005/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=abc123"
# Esperado: abc123

# POST com payload e assinatura correta
PAYLOAD='{"object":"whatsapp_business_account","entry":[{"id":"WABAID","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"","phone_number_id":"TEST_PID"},"contacts":[{"profile":{"name":"Teste"},"wa_id":"5541000000001"}],"messages":[{"id":"wamid.fase02test001","from":"5541000000001","timestamp":"1700000000","type":"text","text":{"body":"Teste FASE-02"}}]}}]}]}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "SEU_APP_SECRET" | cut -d' ' -f2)
curl -s -X POST https://app.oregonservicos.com.br:3005/webhook/whatsapp \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=$SIG" -d "$PAYLOAD"
# Esperado: 200

# Verificar persistência
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT wamid, direction, body, status FROM Messages WHERE wamid='wamid.fase02test001';"

pm2 status oregon-node-dev
```

## Log da fase (marcar durante execução)

- [ ] Subfase A concluída
- [ ] Subfase B concluída
- [ ] Subfase C concluída
- [ ] Critério de aceite da fase verificado
- [ ] Security review consolidado ✅
- [ ] Quality review consolidado ✅
- [ ] Commit feito (hash registrado no log) — sem `--no-verify`, sem secrets/credenciais no diff
- [ ] Log atualizado em [`../10-LOG-EXECUCAO.md`](../10-LOG-EXECUCAO.md)
- [ ] Autorização do usuário para próxima fase
