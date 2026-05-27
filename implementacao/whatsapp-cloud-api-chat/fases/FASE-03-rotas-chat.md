# FASE 03 — Rotas REST do Chat sobre Conversations/Messages

**Duração estimada:** 3h — 4h  
**Dependências:** FASE-01 (`messageService`, repositórios, `cloudApiClient`), FASE-02 (webhook persistindo mensagens inbound)  
**Entregável:** rotas `/zap/*` reescritas para ler/escrever de `Conversations`/`Messages` via Cloud API, mantendo contrato com o frontend existente. Chat funcional ponta a ponta: envio de texto, mídia, reply, listagem de chats e mensagens, janela 24h e templates.

## Objetivo

Substituir a implementação interna das rotas `/zap/*` (que hoje usam `client.getChats()`, `chat.fetchMessages()` e `sendZapMessage` do wwebjs) pela nova camada de persistência e pelo `messageService` da Cloud API. O prefixo `/zap` é MANTIDO para não exigir reescrita do frontend. Apenas a implementação interna muda. Ao final desta fase, o chat funciona de ponta a ponta (envio + recebimento) com Cloud API, mesmo que o frontend ainda tenha alguns componentes visuais do wwebjs (esses são tratados na FASE-04).

## Research relevante

Ver [`../02-RESEARCH.md`](../02-RESEARCH.md) seções 7.4 (corpos de envio), 7.5 (janela 24h), 7.8 (templates) e padrões backend (CommonJS, multi-tenant, `getUserLoggedUser`).

## Subfases

> Cada subfase é construída por um subagent Sonnet 4.6 (medium effort) e validada pelo modelo da sessão. Ordem importa — não pular.

---

### Subfase A — Listagem e Leitura (`allChats`, `getChat`)

**O que construir:** reescrever as rotas de leitura em `server/src/routes/zap-route.js`. Substituir a implementação baseada em wwebjs (`getChats`, `fetchMessages`, `mapearMsg`) por queries nos repositórios `conversationRepository` e `messageRepository`. Manter o shape de resposta que o frontend espera.

Rotas a reescrever:

**`GET /zap/allChats`** — lista conversas da empresa com paginação e busca:
```js
// Query params: page, limit, busca
// Retorna: { chats: [...], total, page, limit }
// Cada chat: { id, contact_wa_id, contact_name, last_message_at, last_message_preview, unread_count, status }
router.get('/allChats', async (req, res) => {
  const { page = 1, limit = 30, busca = '' } = req.query;
  const empresaId = req.user.empresa_id;
  const resultado = await conversationRepository.listConversations(empresaId, {
    page: parseInt(page), limit: Math.min(parseInt(limit), 100), busca
  });
  return res.json({ chats: resultado.rows, total: resultado.total, page: parseInt(page), limit: parseInt(limit) });
});
```

**`GET /zap/getChat/:id`** — busca mensagens de uma conversa com paginação:
```js
// Param :id = conversation_id
// Query params: page, limit
// Retorna: { conversation, messages: [...], total, page, limit }
// Cada mensagem mapeada para shape compatível com o frontend atual:
// { id, wamid, direction, type, body, media_path, media_url, media_mime, media_filename,
//   status, reply_to_wamid, sender_name, timestamp_ms, created_at, fromMe: direction==='outbound' }
router.get('/getChat/:id', async (req, res) => {
  const empresaId = req.user.empresa_id;
  const conversationId = parseInt(req.params.id);
  const { page = 1, limit = 50 } = req.query;
  // Verificar ownership
  const conversation = await conversationRepository.getById(conversationId, empresaId);
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
  // Marcar como lida (zerar unread_count)
  await conversationRepository.markConversationRead(conversationId, empresaId);
  // Buscar mensagens
  const resultado = await messageRepository.getMessages(conversationId, empresaId, {
    page: parseInt(page), limit: Math.min(parseInt(limit), 100)
  });
  return res.json({
    conversation,
    messages: resultado.rows.map(mapearMsgCloud),
    total: resultado.total, page: parseInt(page), limit: parseInt(limit)
  });
});
```

Função `mapearMsgCloud(msg)` — mapear mensagem do banco para o shape que o frontend espera:
```js
function mapearMsgCloud(msg) {
  return {
    id: msg.id,
    wamid: msg.wamid,
    fromMe: msg.direction === 'outbound',
    direction: msg.direction,
    tipo: msg.type,           // compatibilidade com campo 'tipo' do wwebjs
    type: msg.type,
    texto: msg.body,          // compatibilidade com campo 'texto' do wwebjs
    body: msg.body,
    hasMedia: !!(msg.media_path || msg.media_url),
    media: msg.media_path || msg.media_url || null,
    media_path: msg.media_path,
    media_url: msg.media_url,
    media_mime: msg.media_mime,
    media_filename: msg.media_filename,
    senderName: msg.sender_name,
    ack: mapearAckStatus(msg.status),  // wwebjs usava número; mapear para compatibilidade
    status: msg.status,
    reply_to_wamid: msg.reply_to_wamid,
    data: msg.timestamp_ms ? new Date(msg.timestamp_ms).toISOString() : msg.created_at,
    timestamp_ms: msg.timestamp_ms,
    created_at: msg.created_at
  };
}

// Mapear status Cloud API para ACK numérico do wwebjs (retrocompatibilidade)
function mapearAckStatus(status) {
  const map = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
  return map[status] ?? 0;
}
```

**Arquivos prováveis afetados:**
- `server/src/routes/zap-route.js` — reescrever as rotas `GET /allChats` e `GET /getChat/:id`

**Padrões a seguir:**
- Manter o arquivo `zap-route.js` existente — NÃO deletar ou criar novo arquivo
- `req.user.empresa_id` para multi-tenant (padrão existente: a rota já tem `getUserLoggedUser, checkFeature('acessoCRM')` no `index.js`)
- `res.json()` para respostas de sucesso; `res.status(404).json({ error: '...' })` para erros
- Remover imports de `server/src/zap/` desta rota gradualmente (apenas das rotas reescritas nesta subfase) — NÃO remover ainda os imports de rotas ainda não reescritas

**Checklist de segurança específico (esta subfase):**
- [ ] `empresa_id` sempre do JWT (`req.user.empresa_id`) — nunca de `req.params` ou `req.query`
- [ ] `conversationRepository.getById(conversationId, empresaId)` valida ownership antes de retornar mensagens — sem acesso cross-tenant por id numérico
- [ ] Paginação: `limit = Math.min(parseInt(limit), 100)` — máximo 100 por página no servidor
- [ ] `parseInt(req.params.id)` — validar que é número positivo antes de passar para o repositório
- [ ] `busca` em `allChats` deve ser usada com `LIKE '%?%'` parametrizado no repositório — nunca interpolada

**Estratégia de teste:**
```bash
TOKEN="SEU_TOKEN"
# Listar chats
curl -s -X GET "https://app.oregonservicos.com.br:3005/zap/allChats" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Buscar mensagens de uma conversa (usar id retornado acima)
curl -s -X GET "https://app.oregonservicos.com.br:3005/zap/getChat/1" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Critério de aceite:**
1. `GET /zap/allChats` retorna JSON com campo `chats` (array) e `total` — mesmo que vazio inicialmente
2. `GET /zap/getChat/:id` com id de conversa existente retorna JSON com `conversation` e `messages`
3. `GET /zap/getChat/:id` com id de conversa de outra empresa retorna `404`
4. `GET /zap/getChat/:id` zera `unread_count` da conversa no banco

**Comandos de verificação:**
```bash
# Verificar unread_count antes/depois de getChat
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, contact_wa_id, unread_count FROM Conversations LIMIT 5;"
```

**Riscos específicos:**
- Frontend pode depender de campos específicos do wwebjs (ex: `isGroup`, `labels`, `archived`) que não existem no Cloud API → `mapearMsgCloud` deve retornar esses campos como `null` ou `false` sem quebrar — verificar `chat.vue` para campos usados
- Conversa com `contact_wa_id` não cadastrada em `CLIENTES` é normal — o chat funciona mesmo sem cliente cadastrado

---

### Subfase B — Envio (`send-message-chat`, `save-anexo`)

**O que construir:** reescrever as rotas de envio em `server/src/routes/zap-route.js` para usar `messageService` (Cloud API) em vez de wwebjs.

**`POST /zap/send-message-chat`** — envio de texto ou reply:
```js
// Body: { conversationId, text, replyToWamid? }
// Retorna: { success: true, message: <mensagem persistida> }
// Se janela fechada: { windowClosed: true, error: 'WINDOW_CLOSED', message: '...' }
router.post('/send-message-chat', async (req, res) => {
  const { conversationId, text, replyToWamid } = req.body;
  const empresaId = req.user.empresa_id;
  const senderName = req.user.nome || req.user.name || 'Atendente';

  if (!conversationId || !text?.trim()) {
    return res.status(400).json({ error: 'conversationId e text são obrigatórios' });
  }

  const resultado = await messageService.sendTextMessage(
    empresaId, conversationId, text.trim(), replyToWamid, senderName
  );

  if (resultado.windowClosed) {
    return res.status(422).json(resultado);
  }
  if (resultado.error) {
    return res.status(400).json(resultado);
  }

  // Emitir socket para o próprio remetente (confirmação)
  emitToEmpresa(empresaId, 'nova-mensagem', {
    conversation_id: conversationId,
    message: mapearMsgCloud(resultado.message)
  });

  return res.json({ success: true, message: mapearMsgCloud(resultado.message) });
});
```

**`POST /zap/save-anexo`** — upload de arquivo + envio via Cloud API:
```js
// Usa multer para receber arquivo em memória (mesmo padrão do projeto — verificar upload-files.js)
// Body multipart: conversationId, caption? + arquivo
// Retorna: { success: true, message: <mensagem persistida> }
router.post('/save-anexo', upload.single('file'), async (req, res) => {
  const { conversationId, caption } = req.body;
  const empresaId = req.user.empresa_id;
  const senderName = req.user.nome || req.user.name || 'Atendente';

  if (!conversationId || !req.file) {
    return res.status(400).json({ error: 'conversationId e arquivo são obrigatórios' });
  }

  const resultado = await messageService.sendMediaMessage(
    empresaId, conversationId,
    req.file.buffer, req.file.mimetype, req.file.originalname,
    caption, senderName
  );

  if (resultado.windowClosed) return res.status(422).json(resultado);
  if (resultado.error) return res.status(400).json(resultado);

  emitToEmpresa(empresaId, 'nova-mensagem', {
    conversation_id: conversationId,
    message: mapearMsgCloud(resultado.message)
  });

  return res.json({ success: true, message: mapearMsgCloud(resultado.message) });
});
```

[ASSUMPTION: o projeto já usa `multer` para upload de arquivos — verificar em `server/src/routes/upload-files.js` ou `zap-route.js` atual. Se `multer` não estiver configurado na rota, configurar com `memoryStorage()` e limits `{ fileSize: 16 * 1024 * 1024 }` (16MB — limite do WhatsApp para documentos).]

**Arquivos prováveis afetados:**
- `server/src/routes/zap-route.js` — reescrever `POST /send-message-chat` e `POST /save-anexo`

**Padrões a seguir:**
- `const { emitToEmpresa } = require('../socket')` — já importado ou adicionar
- `messageService` importado de `../whatsapp/messageService`
- Multer com `memoryStorage` para não salvar arquivo localmente antes de decidir o destino (o `messageService` faz o upload para o Meta e persiste)

**Checklist de segurança específico (esta subfase):**
- [ ] Validar `conversationId` como inteiro positivo — `parseInt` + verificar `> 0`
- [ ] Validar `text.trim()` não vazio antes de enviar
- [ ] Multer `fileSize` limit de 16MB (limite do WhatsApp para documentos) — `{ limits: { fileSize: 16 * 1024 * 1024 } }`
- [ ] Validar `mimetype` do arquivo contra lista branca (image/jpeg, image/png, image/gif, image/webp, video/mp4, audio/ogg, audio/mpeg, application/pdf, application/msword, ...) — rejeitar mimetypes fora da lista
- [ ] `senderName` vem do JWT (`req.user`) — nunca do body da requisição
- [ ] Erro `WINDOW_CLOSED` retornado com `status 422` — código semântico para "request válido mas rejeitado por regra de negócio"

**Estratégia de teste:**
```bash
TOKEN="SEU_TOKEN"
# Enviar texto (conversation_id existente, janela aberta)
curl -X POST https://app.oregonservicos.com.br:3005/zap/send-message-chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":1,"text":"Teste de envio via Cloud API"}'

# Verificar no banco
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, wamid, direction, body, status FROM Messages ORDER BY id DESC LIMIT 3;"
```

**Critério de aceite:**
1. `POST /zap/send-message-chat` com janela aberta retorna `{ success: true, message: {...} }` e persiste mensagem outbound em `Messages`
2. `POST /zap/send-message-chat` com janela fechada retorna `status 422` com `{ windowClosed: true }`
3. `POST /zap/save-anexo` com arquivo válido retorna `{ success: true }` e `Messages` tem linha com `media_path`
4. `POST /zap/save-anexo` com arquivo > 16MB retorna `status 400`
5. Socket `nova-mensagem` emitido após envio bem-sucedido

**Comandos de verificação:**
```bash
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, wamid, direction, type, body, media_path, status FROM Messages ORDER BY id DESC LIMIT 5;"
```

**Riscos específicos:**
- `multer` pode não estar disponível na rota atual — verificar imports no `zap-route.js` existente antes de escrever
- Envio real para Cloud API requer credenciais Meta válidas + número aprovado — em ambiente de desenvolvimento, o `sendTextMessage` pode retornar erro 190 (token inválido) se as credenciais não estiverem configuradas; o importante é que o código não crasha

---

### Subfase C — Janela 24h + Templates

**O que construir:** endpoint de status da janela, listagem de templates e envio de templates; adicionar rotas em `server/src/routes/whatsapp-config-route.js` (ou nova rota — ver decision abaixo).

**`GET /zap/window-status/:conversationId`** — status da janela de 24h:
```js
// Retorna: { windowOpen: bool, expiresAt: ISO string ou null, hoursRemaining: number ou null }
router.get('/window-status/:conversationId', async (req, res) => {
  const empresaId = req.user.empresa_id;
  const conversationId = parseInt(req.params.conversationId);
  const conversa = await conversationRepository.getById(conversationId, empresaId);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });
  const windowOpen = messageService.isWindowOpen(conversa);
  let expiresAt = null;
  let hoursRemaining = null;
  if (conversa.last_inbound_at) {
    const expiry = new Date(new Date(conversa.last_inbound_at).getTime() + 24 * 3600 * 1000);
    expiresAt = expiry.toISOString();
    hoursRemaining = Math.max(0, (expiry - new Date()) / 3600000);
  }
  return res.json({ windowOpen, expiresAt, hoursRemaining: hoursRemaining ? parseFloat(hoursRemaining.toFixed(1)) : null });
});
```

**`GET /whatsapp/templates`** — listar templates aprovados:
Adicionar em `server/src/routes/whatsapp-config-route.js`:
```js
// Retorna templates APPROVED da conta WABA da empresa
router.get('/templates', async (req, res) => {
  const empresaId = req.user.empresa_id;
  const config = await configRepository.getByEmpresa(empresaId);
  if (!config?.ativo) return res.status(400).json({ error: 'WhatsApp Cloud não configurado para esta empresa' });
  const templates = await cloudApiClient.listTemplates(config);
  return res.json({ templates });
});
```

**`POST /whatsapp/templates/send`** — enviar template:
Adicionar em `server/src/routes/whatsapp-config-route.js`:
```js
// Body: { conversationId, templateName, languageCode, components? }
router.post('/templates/send', async (req, res) => {
  const { conversationId, templateName, languageCode, components = [] } = req.body;
  const empresaId = req.user.empresa_id;
  const senderName = req.user.nome || req.user.name || 'Atendente';

  if (!conversationId || !templateName || !languageCode) {
    return res.status(400).json({ error: 'conversationId, templateName e languageCode são obrigatórios' });
  }

  const resultado = await messageService.sendTemplateMessage(
    empresaId, conversationId, templateName, languageCode, components, senderName
  );
  if (resultado.error) return res.status(400).json(resultado);

  const { emitToEmpresa } = require('../socket');
  emitToEmpresa(empresaId, 'nova-mensagem', {
    conversation_id: conversationId,
    message: resultado.message
  });

  return res.json({ success: true, message: resultado.message });
});
```

**Arquivos prováveis afetados:**
- `server/src/routes/zap-route.js` — adicionar `GET /window-status/:conversationId`
- `server/src/routes/whatsapp-config-route.js` — adicionar `GET /templates` e `POST /templates/send`

**Padrões a seguir:**
- `GET /whatsapp/templates` usa `getUserLoggedUser` (já montado no `app.use('/whatsapp', getUserLoggedUser, ...)`)
- `GET /zap/window-status` usa `getUserLoggedUser` (já montado em `app.use('/zap', getUserLoggedUser, ...)`)

**Checklist de segurança específico (esta subfase):**
- [ ] `GET /whatsapp/templates` busca config pelo `empresa_id` do JWT — um tenant não acessa templates de outro
- [ ] `POST /whatsapp/templates/send` valida `conversationId` pertence à empresa (via `getById` com `empresaId`)
- [ ] `templateName` validado: apenas letras minúsculas, números e underscores (`/^[a-z0-9_]+$/`) — evitar injeção no nome do template
- [ ] `languageCode` validado: formato `xx_XX` ou `xx` (`/^[a-z]{2}(_[A-Z]{2})?$/`)
- [ ] `components` deve ser array — se não for, retornar erro antes de chamar o cloudApiClient
- [ ] Parâmetros de templates (`components[].parameters`) limitados a 10 elementos para evitar abuse

**Estratégia de teste:**
```bash
TOKEN="SEU_TOKEN"
# Status da janela
curl -s -X GET "https://app.oregonservicos.com.br:3005/zap/window-status/1" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Listar templates
curl -s -X GET "https://app.oregonservicos.com.br:3005/whatsapp/templates" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Critério de aceite:**
1. `GET /zap/window-status/:id` retorna `{ windowOpen: bool, expiresAt: ... }` para conversa existente
2. `GET /zap/window-status/:id` com conversa de outra empresa retorna `404`
3. `GET /whatsapp/templates` retorna array de templates (pode ser vazio se não houver templates APPROVED)
4. `POST /whatsapp/templates/send` com `templateName` contendo caracteres inválidos retorna `400`

**Comandos de verificação:**
```bash
# Verificar que as rotas existem
grep -n "window-status\|templates" /var/www/public-oregon/server/src/routes/zap-route.js
grep -n "templates" /var/www/public-oregon/server/src/routes/whatsapp-config-route.js
pm2 logs oregon-node-dev --lines 10 --nostream
```

**Riscos específicos:**
- `listTemplates` faz chamada real ao Meta — se token inválido, retorna erro 190 → tratar com mensagem PT-BR e status 502 (upstream error) em vez de deixar vazar detalhes do erro da Cloud API
- `POST /templates/send` sem conversa com `contact_wa_id` conhecido no Meta → erro 131026 (número inválido) — mapear para mensagem amigável

---

## Critério de aceite da fase (validado depois de TODAS as subfases)

1. `GET /zap/allChats` retorna lista de conversas da empresa em formato JSON com `chats` e `total`
2. `GET /zap/getChat/:id` retorna mensagens com campos `fromMe`, `tipo`, `texto`, `ack`, `status` (retrocompatíveis com frontend)
3. `POST /zap/send-message-chat` com janela aberta persiste mensagem outbound em `Messages` e emite socket `nova-mensagem`
4. `POST /zap/send-message-chat` com janela fechada retorna `422` com `windowClosed: true`
5. `GET /zap/window-status/:id` retorna status correto de janela
6. `GET /whatsapp/templates` retorna JSON com `templates`

## Riscos da fase

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Frontend depende de campos do wwebjs não mapeados em `mapearMsgCloud` | Alto | Verificar `chat.vue` para todos os campos usados; adicionar como `null` em `mapearMsgCloud` |
| Envio real ao Meta falha por credenciais não configuradas no ambiente dev | Médio | Testar fluxo de erro: `send-message-chat` deve retornar 400 com mensagem clara, não 500 |
| `multer` não está na rota `save-anexo` atual | Médio | Verificar `zap-route.js` atual; se não houver, adicionar `multer.memoryStorage()` |
| Templates com `components` mal formatados causam erro 132000 no Meta | Baixo | Validar formato de `components` antes de enviar; mapear erro 132000 |

## Comandos de verificação da fase

```bash
TOKEN=$(curl -s -X POST https://app.oregonservicos.com.br:3005/conta/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a23comunicacoes@gmail.com","password":"teste","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")

# Listar chats
curl -s "https://app.oregonservicos.com.br:3005/zap/allChats" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('total:', d.get('total')); print('chats:', len(d.get('chats',[])))"

# Status janela (ajustar id)
curl -s "https://app.oregonservicos.com.br:3005/zap/window-status/1" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Templates
curl -s "https://app.oregonservicos.com.br:3005/whatsapp/templates" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('templates:', len(d.get('templates',[])))"

pm2 status oregon-node-dev
```

## Log da fase (marcar durante execução)

- [x] Subfase A concluída — allChats + getChat reescritos sobre Conversations/Messages com mapearMsgCloud
- [x] Subfase B concluída — send-message-chat + save-anexo (multer dedicado memoryStorage, whitelist, 16MB) via messageService
- [x] Subfase C concluída — window-status + GET/POST templates
- [x] Critério de aceite da fase verificado — smoke do builder (seed+cleanup) + sanity da sessão (200/404/400/401)
- [x] Security review consolidado ✅ — empresa_id do JWT, ownership via getById, paginação ≤100, whitelist de mimetype, regex anti-injeção em templateName/languageCode, erros Meta → 502 PT-BR (sem 500 cru)
- [x] Quality review consolidado ✅ — rotas wwebjs restantes intactas; mapearMsgCloud retrocompatível
- [x] Commit feito (hash registrado no log)
- [x] Log atualizado em [`../10-LOG-EXECUCAO.md`](../10-LOG-EXECUCAO.md)
- [x] Autorização para próxima fase — **AUTOPILOT**
