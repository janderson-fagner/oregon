# FASE 00 — Modelo de Dados + Camada de Config Meta

**Duração estimada:** 2h — 3h  
**Dependências:** nenhuma  
**Entregável:** tabelas `WhatsappCloudConfig`, `Conversations` e `Messages` criadas no banco de dados DEV + CRUD autenticado de credenciais Meta funcionando via API, com token mascarado na leitura.

## Objetivo

Criar a base de persistência do módulo Cloud API e expor uma rota autenticada para que cada empresa configure suas credenciais Meta (Phone Number ID, WABA ID, Access Token, App Secret, Verify Token). Esta fase não envolve ainda envio de mensagens — apenas infraestrutura de dados e configuração. Sem ela, todas as fases seguintes não têm onde ler credenciais nem persistir mensagens.

## Research relevante

Ver [`../02-RESEARCH.md`](../02-RESEARCH.md) seções 1 (modelo App Meta por empresa), 2 (tabela dedicada `WhatsappCloudConfig`), 3 (token em texto puro — risco aceito), 4 (modelo de `Conversations` e `Messages`) e 5 (versão configurável da Graph API).

## Subfases

> Cada subfase é construída por um subagent Sonnet 4.6 (medium effort) e validada pelo modelo da sessão. Ordem importa — não pular.

---

### Subfase A — Migração de Banco (DDL)

**O que construir:** executar via terminal mysql os comandos DDL que criam as três tabelas novas no banco `DEVdboregonsys`. Todas as colunas devem ser `NULL` por padrão para compatibilidade com versões anteriores do schema (padrão obrigatório do projeto). Usar os nomes exatos de coluna definidos no research, sem inventar novos campos.

DDL a executar (documentar este bloco no arquivo de fase para referência futura):

```sql
-- Tabela de credenciais Meta por empresa
CREATE TABLE IF NOT EXISTS WhatsappCloudConfig (
  id              INT          NOT NULL AUTO_INCREMENT,
  empresa_id      INT          NULL,
  phone_number_id VARCHAR(50)  NULL,
  waba_id         VARCHAR(50)  NULL,
  access_token    TEXT         NULL,
  app_secret      VARCHAR(255) NULL,
  verify_token    VARCHAR(255) NULL,
  display_phone_number VARCHAR(30) NULL,
  graph_api_version VARCHAR(10) NULL DEFAULT 'v23.0',
  ativo           TINYINT(1)   NULL DEFAULT 1,
  created_at      DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_phone_number_id (phone_number_id),
  KEY idx_empresa_id (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de conversas por empresa/número
CREATE TABLE IF NOT EXISTS Conversations (
  id                   INT          NOT NULL AUTO_INCREMENT,
  empresa_id           INT          NULL,
  phone_number_id      VARCHAR(50)  NULL,
  contact_wa_id        VARCHAR(30)  NULL,
  contact_name         VARCHAR(255) NULL,
  last_inbound_at      DATETIME     NULL,
  last_message_at      DATETIME     NULL,
  last_message_preview VARCHAR(255) NULL,
  unread_count         INT          NULL DEFAULT 0,
  status               VARCHAR(30)  NULL DEFAULT 'open',
  created_at           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresa_contact (empresa_id, contact_wa_id),
  KEY idx_empresa_last_msg (empresa_id, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de mensagens persistidas
CREATE TABLE IF NOT EXISTS Messages (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  empresa_id       INT          NULL,
  conversation_id  INT          NULL,
  wamid            VARCHAR(255) NULL,
  direction        ENUM('inbound','outbound') NULL,
  type             VARCHAR(30)  NULL DEFAULT 'text',
  body             TEXT         NULL,
  media_path       VARCHAR(500) NULL,
  media_url        VARCHAR(500) NULL,
  media_mime       VARCHAR(100) NULL,
  media_filename   VARCHAR(255) NULL,
  status           VARCHAR(30)  NULL DEFAULT 'pending',
  error_code       VARCHAR(30)  NULL,
  error_data       JSON         NULL,
  reply_to_wamid   VARCHAR(255) NULL,
  sender_name      VARCHAR(255) NULL,
  timestamp_ms     BIGINT       NULL,
  created_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wamid (wamid),
  KEY idx_conversation_id (conversation_id),
  KEY idx_empresa_id (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Executar via:
```bash
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys << 'EOF'
<DDL acima>
EOF
```

**Arquivos prováveis afetados:**
- Banco de dados `DEVdboregonsys` — novas tabelas criadas
- `server/src/whatsapp/` — novo diretório a criar (não existe ainda)

**Padrões a seguir:**
- Todas as colunas nullable (padrão do projeto: CLAUDE.md "SEMPRE QUE CRIAR COLUNAS/TABELAS, CRIE NULLABLE")
- Charset `utf8mb4` (padrão das tabelas existentes no projeto)
- `created_at` e `updated_at` com `DEFAULT CURRENT_TIMESTAMP` e `ON UPDATE CURRENT_TIMESTAMP`
- Índices explícitos para colunas usadas em WHERE/JOIN frequentes

**Checklist de segurança específico (esta subfase):**
- [ ] Coluna `access_token` criada como `TEXT NULL` (não `NOT NULL`) — permite inserção incremental sem quebrar constraint
- [ ] Coluna `phone_number_id` tem `UNIQUE KEY` — impede duas empresas com o mesmo número Meta (conflito de roteamento no webhook)
- [ ] Coluna `empresa_id` tem índice — lookup por empresa sem full scan
- [ ] Coluna `wamid` em `Messages` tem `UNIQUE KEY` — garante idempotência (mesmo wamid recebido duas vezes não duplica linha)
- [ ] Verificar que DDL usa `IF NOT EXISTS` — idempotente, seguro de re-executar

**Estratégia de teste:**
- Smoke manual: após executar o DDL, verificar que as tabelas existem com `SHOW TABLES LIKE 'Whatsapp%'; SHOW TABLES LIKE 'Conv%'; SHOW TABLES LIKE 'Messages';` e `DESCRIBE WhatsappCloudConfig;`

**Critério de aceite:**
1. `SHOW TABLES LIKE 'WhatsappCloudConfig';` retorna 1 linha
2. `SHOW TABLES LIKE 'Conversations';` retorna 1 linha
3. `SHOW TABLES LIKE 'Messages';` retorna 1 linha
4. `DESCRIBE WhatsappCloudConfig;` mostra coluna `phone_number_id` com `Key=UNI`
5. `DESCRIBE Messages;` mostra coluna `wamid` com `Key=UNI`

**Comandos de verificação:**
```bash
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SHOW TABLES LIKE 'Whatsapp%'; SHOW TABLES LIKE 'Conversations'; SHOW TABLES LIKE 'Messages';"

mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "DESCRIBE WhatsappCloudConfig; DESCRIBE Conversations; DESCRIBE Messages;"
```

**Riscos específicos:**
- Conflito de nome com tabela existente → `CREATE TABLE IF NOT EXISTS` evita erro; verificar com `SHOW TABLES` antes
- `updated_at ON UPDATE CURRENT_TIMESTAMP` pode causar trigger desnecessário em updates parciais → aceitável para este caso
- Charset diferente do banco → `utf8mb4` é padrão; verificar `SHOW CREATE DATABASE DEVdboregonsys` se houver dúvida

---

### Subfase B — Repositório de Config (`configRepository.js`)

**O que construir:** criar o arquivo `server/src/whatsapp/repositories/configRepository.js` com as quatro funções de acesso ao banco para a tabela `WhatsappCloudConfig`. O arquivo deve usar `require` (CommonJS), queries parametrizadas, e NUNCA logar `access_token`, `app_secret` ou `verify_token`. Documentar cada função com JSDoc em PT-BR.

Funções a implementar:

```js
/**
 * Busca a config WhatsApp Cloud da empresa pelo empresa_id.
 * Retorna o objeto completo (incluindo campos sensíveis) — uso interno apenas.
 * @param {number} empresaId
 * @returns {Promise<Object|null>}
 */
async function getByEmpresa(empresaId) { ... }

/**
 * Busca a config pelo phone_number_id (usado pelo webhook para resolver tenant).
 * Lookup O(1) via índice único.
 * @param {string} phoneNumberId
 * @returns {Promise<Object|null>}
 */
async function getByPhoneNumberId(phoneNumberId) { ... }

/**
 * Insere ou atualiza (upsert) a config da empresa.
 * Apenas atualiza campos fornecidos (não sobrescreve token se não enviado).
 * @param {number} empresaId
 * @param {Object} dados - { phone_number_id, waba_id, access_token, app_secret, verify_token, display_phone_number, graph_api_version, ativo }
 * @returns {Promise<void>}
 */
async function upsert(empresaId, dados) { ... }

/**
 * Remove a config da empresa (soft delete: apenas marca ativo=0).
 * @param {number} empresaId
 * @returns {Promise<void>}
 */
async function remove(empresaId) { ... }
```

Usar conexão de banco via o mesmo padrão do projeto — verificar como `server/src/routes/config.js` ou `server/src/routes/zap-route.js` importam o pool/connection do mysql2.

**Arquivos prováveis afetados:**
- `server/src/whatsapp/repositories/configRepository.js` — criar (novo arquivo)
- `server/src/whatsapp/repositories/` — criar diretório

**Padrões a seguir:**
- Importar pool/connection do banco exatamente como feito em `server/src/routes/config.js` (verificar o `require` exato do database)
- `module.exports = { getByEmpresa, getByPhoneNumberId, upsert, remove }` ao final
- Queries parametrizadas: `db.execute('SELECT ... WHERE empresa_id = ?', [empresaId])`
- JSDoc PT-BR em todas as funções (padrão do projeto conforme CLAUDE.md)

**Checklist de segurança específico (esta subfase):**
- [ ] Nenhum `console.log` ou `console.error` imprime `access_token`, `app_secret` ou `verify_token` — se necessário logar, usar `{ ...config, access_token: '[REDACTED]', app_secret: '[REDACTED]', verify_token: '[REDACTED]' }`
- [ ] Todas as queries usam placeholders `?` — zero interpolação de string com dados do usuário
- [ ] Função `upsert` usa `INSERT ... ON DUPLICATE KEY UPDATE` pelo `UNIQUE KEY uq_phone_number_id` OU usa `SELECT` + `INSERT`/`UPDATE` condicional — nunca DELETE+INSERT (perde histórico)
- [ ] Função `remove` faz soft delete (`ativo=0`) — não dropa dados

**Estratégia de teste:**
- Smoke manual: chamar as funções diretamente via script Node temporário ou via rota de config (Subfase C) e verificar no banco com `SELECT * FROM WhatsappCloudConfig;`

**Critério de aceite:**
1. `require('./configRepository')` não lança exceção no boot do servidor
2. `upsert(1, { phone_number_id: 'TEST123', waba_id: 'WABA1', access_token: 'tok', app_secret: 'sec', verify_token: 'ver' })` insere linha no banco — confirmar via `SELECT * FROM WhatsappCloudConfig WHERE empresa_id = 1;`
3. `getByPhoneNumberId('TEST123')` retorna o objeto inserido
4. `remove(1)` marca `ativo=0` — confirmar via `SELECT ativo FROM WhatsappCloudConfig WHERE empresa_id = 1;`

**Comandos de verificação:**
```bash
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, empresa_id, phone_number_id, waba_id, display_phone_number, graph_api_version, ativo, created_at FROM WhatsappCloudConfig LIMIT 5;"
```

**Riscos específicos:**
- Path de importação do database pode diferir do esperado → grep em `server/src/routes/config.js` para localizar o `require` exato antes de escrever o repositório
- `ON DUPLICATE KEY UPDATE` na coluna `phone_number_id` pode conflitar se a empresa tentar mudar o phone_number_id → incluir `phone_number_id` no UPDATE para permitir troca

---

### Subfase C — Serviço + Rotas REST de Config

**O que construir:** criar `server/src/whatsapp/configService.js` (validação + mascaramento) e `server/src/routes/whatsapp-config-route.js` (rotas REST), e registrar a rota em `server/src/index.js` com middleware de autenticação.

**`configService.js`** — funções:
- `getConfig(empresaId)` — chama `configRepository.getByEmpresa`, retorna objeto com campos sensíveis mascarados: `access_token: null`, `app_secret: null`, `verify_token: null` (nunca devolver os valores reais), mais metadados públicos (`phone_number_id`, `waba_id`, `display_phone_number`, `graph_api_version`, `ativo`). Retornar também `webhook_url` = `'https://app.oregonservicos.com.br:3005/webhook/whatsapp'` (URL fixa para o admin copiar e colar no Meta Developer).
- `saveConfig(empresaId, dados)` — valida campos obrigatórios (`phone_number_id`, `waba_id`, `access_token`, `app_secret`, `verify_token`), chama `configRepository.upsert`.
- `deleteConfig(empresaId)` — chama `configRepository.remove`.

**`whatsapp-config-route.js`** — rotas:
- `GET /whatsapp/config` — chama `configService.getConfig(req.user.empresa_id)`; retorna metadados + `webhook_url`; campos sensíveis omitidos/nulos.
- `POST /whatsapp/config` — chama `configService.saveConfig(req.user.empresa_id, req.body)`; retorna `{ success: true }`.
- `DELETE /whatsapp/config` — chama `configService.deleteConfig(req.user.empresa_id)`; retorna `{ success: true }`.

**`server/src/index.js`** — adicionar após linha 101 (onde estão as rotas `/zap`):
```js
app.use('/whatsapp', getUserLoggedUser, require('./routes/whatsapp-config-route'));
```

[ASSUMPTION: a URL do webhook para dev é `https://app.oregonservicos.com.br:3005/webhook/whatsapp` — verificar se há variável de ambiente `APP_URL` ou `BASE_URL` no `.env` para construir dinamicamente]

**Arquivos prováveis afetados:**
- `server/src/whatsapp/configService.js` — criar (novo)
- `server/src/routes/whatsapp-config-route.js` — criar (novo)
- `server/src/index.js` — adicionar linha de registro da rota

**Padrões a seguir:**
- Padrão de rota: ver `server/src/routes/config.js` (mesma estrutura de router + getUserLoggedUser injetado no app)
- `req.user.empresa_id` para isolar por tenant (padrão de todas as rotas autenticadas)
- Retornar erros com `res.status(400).json({ error: '...' })` (padrão do projeto)
- `module.exports = router` ao final do arquivo de rota

**Checklist de segurança específico (esta subfase):**
- [ ] `GET /whatsapp/config` NUNCA retorna `access_token`, `app_secret` ou `verify_token` — campos omitidos ou `null` explicitamente
- [ ] `POST /whatsapp/config` valida que `phone_number_id`, `waba_id`, `access_token`, `app_secret` e `verify_token` estão presentes e são strings não vazias antes de persistir
- [ ] `req.user.empresa_id` sempre usado para isolar operações — jamais aceitar `empresa_id` do `req.body`
- [ ] Rota registrada com `getUserLoggedUser` — não é pública
- [ ] Validar que `graph_api_version`, se fornecida, tem formato `vX.Y` (regex `^v\d+\.\d+$`) para evitar injeção no path da URL da Graph API

**Estratégia de teste:**
- Smoke manual via curl (autenticado):
```bash
# Login e captura do token
TOKEN=$(curl -s -X POST https://app.oregonservicos.com.br:3005/conta/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a23comunicacoes@gmail.com","password":"teste","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")

# Salvar config
curl -X POST https://app.oregonservicos.com.br:3005/whatsapp/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone_number_id":"TEST_PID","waba_id":"TEST_WABA","access_token":"tok_test","app_secret":"sec_test","verify_token":"ver_test","display_phone_number":"+55 41 99999-0000"}'

# Ler config (deve retornar sem token)
curl -X GET https://app.oregonservicos.com.br:3005/whatsapp/config \
  -H "Authorization: Bearer $TOKEN"
```

**Critério de aceite:**
1. `POST /whatsapp/config` com campos válidos retorna `{ "success": true }` e persiste no banco
2. `GET /whatsapp/config` retorna JSON com `phone_number_id`, `waba_id`, `webhook_url` e `access_token: null` (sem o valor real)
3. `DELETE /whatsapp/config` retorna `{ "success": true }` e banco mostra `ativo=0`
4. `POST /whatsapp/config` sem `phone_number_id` retorna `status 400`
5. Chamada sem token retorna `status 401` (middleware de auth funcionando)

**Comandos de verificação:**
```bash
# Verificar dados no banco após smoke test
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT id, empresa_id, phone_number_id, waba_id, display_phone_number, ativo FROM WhatsappCloudConfig;"

# Verificar que a rota foi registrada (PM2 deve estar online sem erros após editar index.js)
pm2 logs oregon-node-dev --lines 20 --nostream
```

**Riscos específicos:**
- `index.js` já tem `express.json()` na linha 24 — não modificar esse middleware agora (raw body é concern da FASE-02); apenas adicionar a nova rota
- Conflito de path `/whatsapp` com outra rota existente → verificar com `grep -n "'/whatsapp'" server/src/index.js` antes de adicionar
- `graph_api_version` recebida do frontend sem validação pode injetar caracteres no path da URL → validar com regex

---

## Critério de aceite da fase (validado depois de TODAS as subfases)

1. `SHOW TABLES` retorna `WhatsappCloudConfig`, `Conversations` e `Messages` com todos os índices corretos (`DESCRIBE` ou `SHOW INDEX FROM`)
2. `POST /whatsapp/config` salva credenciais e `GET /whatsapp/config` retorna metadados sem expor tokens — verificável via curl autenticado
3. PM2 (`pm2 status oregon-node-dev`) mostra status `online` após as alterações em `index.js`, sem erros de boot no log

## Riscos da fase

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| DDL falha por charset incompatível com a versão do MySQL do servidor | Médio | Testar com `SHOW VARIABLES LIKE 'character_set%'`; usar `utf8mb4` que é amplamente suportado |
| `phone_number_id` UNIQUE: empresa tenta sobrescrever com novo phone_number_id e gera conflito | Médio | `upsert` deve fazer `INSERT ... ON DUPLICATE KEY UPDATE` incluindo `phone_number_id` na cláusula UPDATE, ou deletar+inserir explicitamente com aviso |
| Rota `/whatsapp` conflita com rota existente não mapeada | Baixo | Grep em `index.js` antes de registrar; não há `/whatsapp` nas rotas conhecidas |
| Token de longa duração (System User Token) não usado — token expira → chat para | Alto | Documentar no formulário de credenciais (FASE-04) que deve ser System User Token; aqui apenas persistir o que for fornecido |

## Comandos de verificação da fase

```bash
# Tabelas existem
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SHOW TABLES LIKE 'Whatsapp%'; SHOW TABLES LIKE 'Conv%'; SHOW TABLES LIKE 'Messages';"

# Índices críticos
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SHOW INDEX FROM WhatsappCloudConfig; SHOW INDEX FROM Conversations; SHOW INDEX FROM Messages;"

# PM2 saudável
pm2 status oregon-node-dev

# Smoke da rota (ajustar token)
curl -s -X GET https://app.oregonservicos.com.br:3005/whatsapp/config \
  -H "Authorization: Bearer SEU_TOKEN" | python3 -m json.tool
```

## Log da fase (marcar durante execução)

- [x] Subfase A concluída — 3 tabelas criadas (índices UNI em phone_number_id e wamid confirmados)
- [x] Subfase B concluída — configRepository.js (write-only nos tokens)
- [x] Subfase C concluída — configService.js + whatsapp-config-route.js + montagem em index.js
- [x] Critério de aceite da fase verificado — smoke completo via curl (login → POST/GET/DELETE)
- [x] Security review consolidado ✅ — secrets nunca retornados, queries parametrizadas, regex anti-injeção, fix de vazamento de err.message em 500
- [x] Quality review consolidado ✅
- [x] Commit feito (hash registrado no log) — sem `--no-verify`, sem secrets no diff
- [x] Log atualizado em [`../10-LOG-EXECUCAO.md`](../10-LOG-EXECUCAO.md)
- [x] Autorização para próxima fase — **AUTOPILOT** (decisão autônoma da sessão)
