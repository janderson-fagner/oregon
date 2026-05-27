# FASE 01 — Cliente Cloud API (Camada HTTP) + Repositórios de Mensagens

**Duração estimada:** 3h — 4h  
**Dependências:** FASE-00 (tabelas `WhatsappCloudConfig`, `Conversations` e `Messages` existem; `configRepository` disponível)  
**Entregável:** módulo `server/src/whatsapp/cloudApiClient.js` capaz de enviar/receber mensagens e mídia via Graph API, repositórios `conversationRepository.js` e `messageRepository.js` com persistência idempotente, e `messageService.js` que orquestra envio com verificação de janela de 24h.

## Objetivo

Construir a camada de comunicação com a Graph API do Meta e a camada de persistência de conversas e mensagens. Esta fase é o núcleo técnico da migração — sem ela, nem o webhook (FASE-02) nem as rotas de chat (FASE-03) conseguem funcionar. O cliente HTTP usa `axios` (biblioteca já presente no projeto), mapeia os erros da Cloud API para mensagens PT-BR e nunca loga tokens.

## Research relevante

Ver [`../02-RESEARCH.md`](../02-RESEARCH.md) seções 7.1 (endpoints Cloud API), 7.3 (payload webhook), 7.4 (corpos de envio), 7.5 (janela 24h), 7.6 (download de mídia inbound), 7.7 (upload de mídia outbound), 7.8 (listagem de templates), 7.9 (erros) e 7.10 (limites).

## Subfases

> Cada subfase é construída por um subagent Sonnet 4.6 (medium effort) e validada pelo modelo da sessão. Ordem importa — não pular.

---

### Subfase A — Cliente HTTP Cloud API (`cloudApiClient.js`)

**O que construir:** criar `server/src/whatsapp/cloudApiClient.js` com todas as funções de comunicação com a Graph API do Meta. O módulo usa `axios` (já instalado: `axios@^1.6.7` no `package.json`). Cada função recebe a config da empresa (objeto com `access_token`, `phone_number_id`, `waba_id`, `graph_api_version`) e os parâmetros de conteúdo. A versão da API vem de `config.graph_api_version || process.env.GRAPH_API_VERSION || 'v23.0'`.

Funções a implementar (todas assíncronas, com JSDoc PT-BR):

```js
/**
 * Envia mensagem de texto simples.
 * @param {Object} config - credenciais da empresa
 * @param {string} to - número E.164 sem '+' (ex: 5541999999999)
 * @param {string} text - corpo da mensagem
 * @param {string} [replyToWamid] - wamid da mensagem a ser citada (opcional)
 */
async function sendText(config, to, text, replyToWamid = null) { ... }

/**
 * Envia mensagem de mídia (image/document/audio/video).
 * Aceita envio por mediaId (upload prévio) ou link direto.
 * @param {Object} config
 * @param {string} to
 * @param {'image'|'document'|'audio'|'video'} mediaType
 * @param {Object} mediaParams - { id?, link?, caption?, filename? }
 * @param {string} [replyToWamid]
 */
async function sendMedia(config, to, mediaType, mediaParams, replyToWamid = null) { ... }

/**
 * Envia template aprovado (fora da janela de 24h).
 * @param {Object} config
 * @param {string} to
 * @param {string} templateName
 * @param {string} languageCode - ex: 'pt_BR'
 * @param {Array} components - array de componentes com parâmetros
 */
async function sendTemplate(config, to, templateName, languageCode, components) { ... }

/**
 * Marca mensagem como lida (envia status:read para a Cloud API).
 * @param {Object} config
 * @param {string} wamid - ID da mensagem a marcar
 */
async function markAsRead(config, wamid) { ... }

/**
 * Faz upload de mídia para a Cloud API e retorna o media_id.
 * @param {Object} config
 * @param {Buffer} fileBuffer - conteúdo do arquivo
 * @param {string} mimeType - ex: 'image/jpeg'
 * @param {string} filename
 * @returns {Promise<string>} media_id retornado pelo Meta
 */
async function uploadMedia(config, fileBuffer, mimeType, filename) { ... }

/**
 * Busca a URL temporária de download de uma mídia pelo media_id.
 * @param {Object} config
 * @param {string} mediaId
 * @returns {Promise<{url: string, mime_type: string, file_size: number}>}
 */
async function getMediaUrl(config, mediaId) { ... }

/**
 * Baixa o arquivo de mídia a partir da URL temporária e salva em /uploads/midias/.
 * A URL expira em minutos — chamar imediatamente após getMediaUrl.
 * @param {Object} config
 * @param {string} mediaUrl - URL temporária retornada pelo Meta
 * @param {string} mimeType
 * @param {number} empresaId - usado para organizar subpasta
 * @returns {Promise<string>} path local relativo (ex: midias/1/uuid.jpg)
 */
async function downloadMedia(config, mediaUrl, mimeType, empresaId) { ... }

/**
 * Lista templates aprovados da conta WABA.
 * Filtra apenas status=APPROVED.
 * @param {Object} config
 * @returns {Promise<Array>} lista de templates com name, status, category, language, components
 */
async function listTemplates(config) { ... }
```

Mapear erros da Cloud API para mensagens PT-BR em função auxiliar `mapearErroMeta(errorCode)`:
- `131047` → `'Janela de 24h encerrada. Envie um template para reabrir o contato.'`
- `131026` → `'Mensagem não entregável: número inválido ou bloqueou o contato.'`
- `131056` → `'Limite de mensagens por par atingido. Tente novamente em instantes.'`
- `190` → `'Token de acesso Meta inválido ou expirado. Renove as credenciais.'`
- `132001` → `'Template inexistente ou não aprovado. Atualize a lista de templates.'`
- `132000` → `'Número incorreto de parâmetros no template.'`
- `100` → `'Parâmetro inválido (verifique phone_number_id e waba_id nas configurações).'`
- `80007` → `'Limite geral de requisições atingido. Aguarde e tente novamente.'`
- default → `'Erro na API do WhatsApp (código ${errorCode}).'`

Para erros `131056` e `80007`: aplicar retry com backoff exponencial (1s, 2s, 4s — máximo 3 tentativas).

**Arquivos prováveis afetados:**
- `server/src/whatsapp/cloudApiClient.js` — criar (novo)

**Padrões a seguir:**
- `const axios = require('axios')` — mesmo padrão de `server/src/routes/pagamentos.js` e `server/src/routes/templates.js`
- `module.exports = { sendText, sendMedia, sendTemplate, markAsRead, uploadMedia, getMediaUrl, downloadMedia, listTemplates }` ao final
- Timeout nas requisições axios: `timeout: 30000` (30s) para chamadas normais; `timeout: 60000` para download de mídia (arquivo pode ser grande)
- Pasta de destino do download: `/uploads/midias/{empresaId}/` — criar com `fs.mkdirSync(..., { recursive: true })` se não existir
- Nome do arquivo salvo: `{uuid}.{extensão inferida do mimeType}` (usar `crypto.randomUUID()` ou `uuid` se disponível; senão `Date.now() + Math.random()`)
- JSDoc PT-BR em todas as funções

**Checklist de segurança específico (esta subfase):**
- [ ] Nenhuma função loga `config.access_token` — se necessário logar config, sanitizar antes: `{ ...config, access_token: '[REDACTED]' }`
- [ ] `axios` configurado com `timeout` em todas as chamadas — evita hang infinito
- [ ] `downloadMedia` valida que a extensão inferida do mimeType é uma lista branca (ex: jpg, jpeg, png, gif, webp, mp4, mp3, ogg, pdf, doc, docx) — evitar salvar arquivos com extensão arbitrária
- [ ] `uploadMedia` recebe `Buffer` — nunca executa conteúdo de arquivo
- [ ] Path de download não permite path traversal — `empresaId` deve ser número inteiro validado; nome do arquivo gerado localmente (uuid), não vem do Meta
- [ ] Retry com backoff apenas para erros 131056 e 80007 — não fazer retry em erros 190 (token inválido) ou 131047 (janela fechada)

**Estratégia de teste:**
- Smoke manual (requer credenciais Meta reais configuradas na Subfase C da FASE-00):
```bash
# Não é possível testar sem credenciais Meta reais — testar junto com FASE-02 e FASE-03
# Verificação estrutural: o módulo carrega sem exceção
node -e "const c = require('./server/src/whatsapp/cloudApiClient'); console.log(Object.keys(c));"
```

**Critério de aceite:**
1. `require('./server/src/whatsapp/cloudApiClient')` não lança exceção — módulo carrega
2. Todas as funções exportadas estão presentes: `sendText`, `sendMedia`, `sendTemplate`, `markAsRead`, `uploadMedia`, `getMediaUrl`, `downloadMedia`, `listTemplates`
3. `mapearErroMeta(131047)` retorna string PT-BR sobre janela 24h
4. PM2 boot sem erro após o arquivo existir (node não executa nada ao importar — só define funções)

**Comandos de verificação:**
```bash
cd /var/www/public-oregon/server && node -e "
const c = require('./src/whatsapp/cloudApiClient');
console.log('Funções exportadas:', Object.keys(c));
"

pm2 logs oregon-node-dev --lines 10 --nostream
```

**Riscos específicos:**
- `crypto.randomUUID()` disponível apenas no Node 14.17+ → verificar versão do Node; se necessário usar `require('crypto').randomBytes(16).toString('hex')`
- Mime-to-extension pode não cobrir todos os tipos que o Meta envia → ter fallback de extensão `.bin` para tipos desconhecidos (nunca falhar o download por mime não mapeado)
- URL de download da mídia Meta expira em minutos → `downloadMedia` deve ser chamado imediatamente ao receber o webhook (tratado na FASE-02)

---

### Subfase B — Repositórios `Conversations` e `Messages`

**O que construir:** criar `server/src/whatsapp/repositories/conversationRepository.js` e `server/src/whatsapp/repositories/messageRepository.js` com todas as operações de banco necessárias para o chat. Queries parametrizadas, sem ORM, CommonJS.

**`conversationRepository.js`** — funções:

```js
/**
 * Insere ou atualiza conversa (upsert por empresa_id + contact_wa_id).
 * Atualiza last_message_at, last_message_preview, unread_count e,
 * quando for mensagem inbound, last_inbound_at.
 * @param {Object} dados - { empresa_id, phone_number_id, contact_wa_id, contact_name, last_inbound_at?, last_message_at, last_message_preview, unread_count? }
 * @returns {Promise<number>} id da conversa
 */
async function upsertConversation(dados) { ... }

/**
 * Lista conversas da empresa com paginação e busca opcional por nome/telefone.
 * @param {number} empresaId
 * @param {Object} opcoes - { page=1, limit=30, busca='' }
 * @returns {Promise<{rows: Array, total: number}>}
 */
async function listConversations(empresaId, opcoes) { ... }

/**
 * Busca uma conversa pelo id, validando que pertence à empresa.
 * @param {number} conversationId
 * @param {number} empresaId
 * @returns {Promise<Object|null>}
 */
async function getById(conversationId, empresaId) { ... }

/**
 * Zera unread_count da conversa (marcar como lida).
 * @param {number} conversationId
 * @param {number} empresaId
 */
async function markConversationRead(conversationId, empresaId) { ... }
```

**`messageRepository.js`** — funções:

```js
/**
 * Insere nova mensagem.
 * Ignora se wamid já existir (idempotência via UNIQUE KEY).
 * Retorna o id inserido (ou null se wamid duplicado).
 * @param {Object} dados - { empresa_id, conversation_id, wamid?, direction, type, body?, media_path?, media_mime?, media_filename?, status, reply_to_wamid?, sender_name?, timestamp_ms? }
 * @returns {Promise<number|null>}
 */
async function insertMessage(dados) { ... }

/**
 * Atualiza status de uma mensagem pelo wamid (status update do webhook).
 * @param {string} wamid
 * @param {string} status - 'sent'|'delivered'|'read'|'failed'
 * @param {Object} [errorData] - dados de erro se status=failed
 * @param {number} empresaId - para segurança (isolar tenant)
 */
async function updateMessageStatusByWamid(wamid, status, errorData, empresaId) { ... }

/**
 * Busca mensagens de uma conversa com paginação (mais recentes primeiro).
 * @param {number} conversationId
 * @param {number} empresaId
 * @param {Object} opcoes - { page=1, limit=50 }
 * @returns {Promise<{rows: Array, total: number}>}
 */
async function getMessages(conversationId, empresaId, opcoes) { ... }

/**
 * Busca mensagem pelo wamid, validando tenant.
 * @param {string} wamid
 * @param {number} empresaId
 * @returns {Promise<Object|null>}
 */
async function getByWamid(wamid, empresaId) { ... }
```

**Arquivos prováveis afetados:**
- `server/src/whatsapp/repositories/conversationRepository.js` — criar (novo)
- `server/src/whatsapp/repositories/messageRepository.js` — criar (novo)

**Padrões a seguir:**
- Importar pool/connection exatamente como em `server/src/routes/config.js` (verificar o `require` de database antes de escrever)
- `module.exports = { ... }` ao final de cada arquivo
- `INSERT IGNORE INTO Messages (...)` ou `INSERT ... ON DUPLICATE KEY UPDATE updated_at=NOW()` para garantir idempotência por `wamid`
- Paginação via `LIMIT ? OFFSET ?` com `COUNT(*)` em query separada
- `DISTINCT` em `listConversations` se necessário para evitar duplicatas
- ORDER: `listConversations` por `last_message_at DESC`; `getMessages` por `timestamp_ms ASC` (ordem cronológica)

**Checklist de segurança específico (esta subfase):**
- [ ] `empresa_id` sempre presente em todo `WHERE` de busca — isolamento de tenant
- [ ] `getMessages` e `getById` incluem `AND empresa_id = ?` — não permite acesso cross-tenant por id
- [ ] `updateMessageStatusByWamid` inclui `AND empresa_id = ?` — empresa A não pode alterar status de mensagem da empresa B
- [ ] Paginação com `limit` máximo de 100 (forçado no servidor) — evitar dump de toda a tabela
- [ ] `upsertConversation` usa `INSERT ... ON DUPLICATE KEY UPDATE` pela chave `(empresa_id, contact_wa_id)` — evitar duplicatas e race condition com dois webhooks simultâneos

**Estratégia de teste:**
- Smoke via inserção direta no banco após criação dos arquivos:
```bash
# Verificar que as funções existem
node -e "
const c = require('./server/src/whatsapp/repositories/conversationRepository');
const m = require('./server/src/whatsapp/repositories/messageRepository');
console.log('Conv:', Object.keys(c));
console.log('Msgs:', Object.keys(m));
"
```
- Integration smoke (requer banco disponível): inserir conversa, depois mensagem, verificar no banco

**Critério de aceite:**
1. `require('./conversationRepository')` e `require('./messageRepository')` carregam sem exceção
2. `upsertConversation({ empresa_id: 1, phone_number_id: 'PID', contact_wa_id: '5541999990000', contact_name: 'Teste', last_message_at: new Date(), last_message_preview: 'Olá' })` retorna id numérico e linha aparece em `SELECT * FROM Conversations`
3. `insertMessage({ empresa_id: 1, conversation_id: <id_acima>, direction: 'inbound', type: 'text', body: 'Olá', status: 'pending', wamid: 'wamid.test1' })` insere linha; segunda chamada com mesmo wamid NÃO duplica
4. `updateMessageStatusByWamid('wamid.test1', 'delivered', null, 1)` atualiza status no banco

**Comandos de verificação:**
```bash
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, empresa_id, contact_wa_id, contact_name, last_message_at FROM Conversations LIMIT 5;"

mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, conversation_id, wamid, direction, type, body, status FROM Messages LIMIT 5;"
```

**Riscos específicos:**
- Race condition no webhook: dois POSTs simultâneos para o mesmo wamid → `INSERT IGNORE` ou `ON DUPLICATE KEY UPDATE` resolve no nível do banco
- `upsertConversation` com `ON DUPLICATE KEY UPDATE` no MySQL pode precisar de `id = LAST_INSERT_ID(id)` para retornar o id correto quando é update (não insert) → usar esse trick explicitamente
- `timestamp_ms` pode ser `null` para mensagens outbound criadas localmente → queries de ORDER devem tratar NULL (usar `COALESCE(timestamp_ms, UNIX_TIMESTAMP(created_at)*1000)`)

---

### Subfase C — Serviço de Mensagens (`messageService.js`)

**O que construir:** criar `server/src/whatsapp/messageService.js` que orquestra o fluxo completo de envio: resolve credenciais da empresa, verifica janela de 24h, envia via `cloudApiClient`, persiste a mensagem e atualiza a conversa.

Funções a implementar:

```js
/**
 * Verifica se a janela de 24h está ativa para uma conversa.
 * Janela ativa = last_inbound_at existe E (NOW - last_inbound_at) < 24 horas.
 * @param {Object} conversation - objeto da conversa com last_inbound_at
 * @returns {boolean}
 */
function isWindowOpen(conversation) { ... }

/**
 * Envia mensagem de texto (ou reply) para um contato da empresa.
 * 1. Busca config da empresa (configRepository.getByEmpresa)
 * 2. Busca conversa (conversationRepository.getById ou cria)
 * 3. Verifica janela 24h — se fechada, retorna { windowClosed: true }
 * 4. Envia via cloudApiClient.sendText
 * 5. Persiste mensagem outbound (direction='outbound', status='sent', wamid do retorno)
 * 6. Atualiza conversa (last_message_at, last_message_preview)
 * 7. Retorna { success: true, wamid, conversationId }
 * @param {number} empresaId
 * @param {number} conversationId
 * @param {string} text
 * @param {string} [replyToWamid]
 * @param {string} [senderName]
 * @returns {Promise<Object>}
 */
async function sendTextMessage(empresaId, conversationId, text, replyToWamid, senderName) { ... }

/**
 * Envia arquivo de mídia para um contato.
 * Upload prévio via cloudApiClient.uploadMedia; depois sendMedia com o media_id.
 * Persiste a mensagem outbound com media_path local.
 * @param {number} empresaId
 * @param {number} conversationId
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {string} filename
 * @param {string} [caption]
 * @param {string} [senderName]
 */
async function sendMediaMessage(empresaId, conversationId, fileBuffer, mimeType, filename, caption, senderName) { ... }

/**
 * Envia template (não verifica janela — templates são permitidos sempre).
 * @param {number} empresaId
 * @param {number} conversationId
 * @param {string} templateName
 * @param {string} languageCode
 * @param {Array} components
 * @param {string} [senderName]
 */
async function sendTemplateMessage(empresaId, conversationId, templateName, languageCode, components, senderName) { ... }

/**
 * Marca mensagem como lida e zera unread_count da conversa.
 * @param {number} empresaId
 * @param {string} wamid
 * @param {number} conversationId
 */
async function markMessageRead(empresaId, wamid, conversationId) { ... }
```

Erro estruturado quando janela fechada:
```js
return {
  windowClosed: true,
  error: 'WINDOW_CLOSED',
  message: 'A janela de 24h está encerrada. Envie um template para retomar o contato.'
};
```

**Arquivos prováveis afetados:**
- `server/src/whatsapp/messageService.js` — criar (novo)

**Padrões a seguir:**
- Importar `configRepository` de `../whatsapp/repositories/configRepository`
- Importar `conversationRepository` de `../whatsapp/repositories/conversationRepository`
- Importar `messageRepository` de `../whatsapp/repositories/messageRepository`
- Importar `cloudApiClient` de `../whatsapp/cloudApiClient`
- `module.exports = { isWindowOpen, sendTextMessage, sendMediaMessage, sendTemplateMessage, markMessageRead }` ao final
- Função `sendTextMessage` deve tratar o caso de conversa não encontrada → retornar erro claro `{ error: 'CONVERSATION_NOT_FOUND' }`
- Não emitir socket aqui (responsabilidade das rotas e do webhook handler)

**Checklist de segurança específico (esta subfase):**
- [ ] `empresaId` sempre usado para resolver config — nunca aceitar config de outro tenant
- [ ] Validar que `conversationId` pertence à `empresaId` antes de enviar (via `conversationRepository.getById(conversationId, empresaId)`)
- [ ] `text` não pode ser vazio ou apenas espaços — validar antes de chamar `sendText`
- [ ] `sendTemplateMessage` não verifica janela — documentar explicitamente com comentário que templates são permitidos fora da janela (comportamento intencional)
- [ ] Erros da Cloud API (ex: 190 — token expirado) são propagados com `mapearErroMeta` — não silenciar

**Estratégia de teste:**
- Smoke via curl após FASE-03 (as rotas chamam o messageService)
- Verificar `isWindowOpen` com datas mockadas:
```bash
node -e "
const { isWindowOpen } = require('./server/src/whatsapp/messageService');
// Janela aberta: last_inbound_at há 2h
console.log('2h atrás:', isWindowOpen({ last_inbound_at: new Date(Date.now() - 2*3600*1000) })); // true
// Janela fechada: last_inbound_at há 25h
console.log('25h atrás:', isWindowOpen({ last_inbound_at: new Date(Date.now() - 25*3600*1000) })); // false
// Sem inbound: null
console.log('null:', isWindowOpen({ last_inbound_at: null })); // false
"
```

**Critério de aceite:**
1. `isWindowOpen({ last_inbound_at: new Date(Date.now() - 2*3600*1000) })` retorna `true`
2. `isWindowOpen({ last_inbound_at: new Date(Date.now() - 25*3600*1000) })` retorna `false`
3. `isWindowOpen({ last_inbound_at: null })` retorna `false`
4. `sendTextMessage` com `conversationId` de outra empresa retorna `{ error: 'CONVERSATION_NOT_FOUND' }`
5. PM2 boot sem erro

**Comandos de verificação:**
```bash
cd /var/www/public-oregon/server && node -e "
const s = require('./src/whatsapp/messageService');
console.log('Funções:', Object.keys(s));
const { isWindowOpen } = s;
console.log('2h:', isWindowOpen({ last_inbound_at: new Date(Date.now() - 2*60*60*1000) }));
console.log('25h:', isWindowOpen({ last_inbound_at: new Date(Date.now() - 25*60*60*1000) }));
console.log('null:', isWindowOpen({ last_inbound_at: null }));
"
pm2 logs oregon-node-dev --lines 5 --nostream
```

**Riscos específicos:**
- `configRepository.getByEmpresa` retorna campos sensíveis — `messageService` usa o token internamente mas NUNCA loga; garantir com linter mental ao revisar
- Conversa pode ainda não existir quando atendente tenta enviar primeiro (empresa inicia contato) → `sendTextMessage` deve aceitar `contact_wa_id` como alternativa a `conversationId`, ou criar a conversa automaticamente [ASSUMPTION: nesta fase, a conversa sempre existe pois o webhook cria via upsert na FASE-02; envio de texto primeiro (business-initiated) é edge case tratado na FASE-03]
- `uploadMedia` no `sendMediaMessage` pode falhar após o arquivo já ter sido aceito pelo frontend → tratar com cleanup do arquivo local em caso de erro no upload Meta

---

## Critério de aceite da fase (validado depois de TODAS as subfases)

1. `node -e "require('./server/src/whatsapp/cloudApiClient')"` carrega sem exceção e lista todas as 8 funções exportadas
2. `node -e "require('./server/src/whatsapp/repositories/conversationRepository')"` e `messageRepository` carregam sem exceção
3. `isWindowOpen` com `last_inbound_at` de 2h atrás retorna `true`; com 25h retorna `false`; com `null` retorna `false`
4. Inserção de teste via `upsertConversation` e `insertMessage` persiste no banco e é idempotente no `wamid`
5. PM2 `online` sem erros após criação dos arquivos

## Riscos da fase

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Token Meta expirado durante teste — todas as chamadas à Cloud API falham com erro 190 | Alto | Testar com credenciais reais apenas na FASE-03; aqui testar apenas carregamento dos módulos e lógica local (isWindowOpen) |
| Mime-type desconhecido ao salvar mídia → extensão inválida | Médio | Fallback para `.bin` com lista branca de mimes conhecidos; nunca falhar o download por mime não mapeado |
| Race condition no upsert de conversa (dois webhooks simultâneos) | Médio | `ON DUPLICATE KEY UPDATE` no MySQL resolve; testar com dois inserts do mesmo `contact_wa_id` |
| `cloudApiClient.sendText` sem timeout → processo pode travar | Alto | `timeout: 30000` em todas as chamadas axios; aplicar desde a criação |

## Comandos de verificação da fase

```bash
cd /var/www/public-oregon/server

# Carregamento dos módulos
node -e "
['./src/whatsapp/cloudApiClient',
 './src/whatsapp/repositories/conversationRepository',
 './src/whatsapp/repositories/messageRepository',
 './src/whatsapp/messageService'
].forEach(m => {
  try { const mod = require(m); console.log('OK ' + m + ':', Object.keys(mod).join(', ')); }
  catch(e) { console.error('ERRO ' + m + ':', e.message); }
});
"

# isWindowOpen
node -e "
const { isWindowOpen } = require('./src/whatsapp/messageService');
const ok = isWindowOpen({ last_inbound_at: new Date(Date.now() - 2*3600*1000) });
const nok = isWindowOpen({ last_inbound_at: new Date(Date.now() - 25*3600*1000) });
const nul = isWindowOpen({ last_inbound_at: null });
console.log('Janela aberta (2h):', ok === true ? 'PASS' : 'FAIL');
console.log('Janela fechada (25h):', nok === false ? 'PASS' : 'FAIL');
console.log('Sem inbound (null):', nul === false ? 'PASS' : 'FAIL');
"

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
