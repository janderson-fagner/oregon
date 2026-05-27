# FASE 05 — Remoção do wwebjs + Stubs TODO

**Duração estimada:** 2h — 3h  
**Dependências:** FASE-04 aprovada (frontend 100% sem referências wwebjs, chat funcionando com Cloud API)  
**Entregável:** aplicação Node sobe sem `whatsapp-web.js`, sem processo Chrome/Puppeteer, sem erros de sessão no PM2 — fluxos/crons/disparos/IA com stubs que não crasham.

> **ATENÇÃO CRÍTICA:** esta fase é DESTRUTIVA e IRREVERSÍVEL para a dependência wwebjs. Só executar após FASE-04 aprovada e chat 100% funcional via Cloud API. NÃO dropar tabelas — apenas parar de ler/escrever. Fazer commit da FASE-04 antes de iniciar esta fase.

## Objetivo

Eliminar completamente a dependência de `whatsapp-web.js` (wwebjs) e seus efeitos colaterais (sessão Chrome/Puppeteer, QR code, tabela `Clients`). Todos os pontos do código que chamavam `sendZapMessage`, `sendZapMessageImage` ou `sendMessageChat` do wwebjs recebem stubs que logar um aviso `TODO` e retornam no-op sem lançar exceção. O resultado é uma aplicação que sobe limpa, sem erros, sem Chrome, e com o chat 100% na Cloud API.

## Research relevante

Ver [`../02-RESEARCH.md`](../02-RESEARCH.md) — padrões backend (CommonJS). Arquivos atuais relevantes: `server/src/zap/client.js`, `server/src/zap/index.js`, `server/src/zap/message.js`, `server/src/crons.js`, `server/src/utils/crmUtils.js`, `server/src/flows/actions/messageActions.js`.

## Subfases

> Cada subfase é construída por um subagent Sonnet 4.6 (medium effort) e validada pelo modelo da sessão. Ordem importa — não pular.

---

### Subfase A — Remover Lib e Sessão wwebjs

**O que construir:** remover a dependência `whatsapp-web.js` do `package.json`, esvaziar/neutralizar os arquivos do módulo `server/src/zap/` que inicializam o cliente wwebjs, e garantir que nenhum `require` do wwebjs sobreviva no código.

**Passos:**

1. **Remover do `package.json`:**
   ```bash
   cd /var/www/public-oregon/server && npm uninstall whatsapp-web.js
   ```
   [ASSUMPTION: `whatsapp-web.js` está nas `dependencies` do `server/package.json` — verificar antes de executar]

2. **Esvaziar `server/src/zap/client.js`** — substituir todo o conteúdo por:
   ```js
   /**
    * MÓDULO WWEBJS REMOVIDO
    * O chat agora usa WhatsApp Cloud API oficial do Meta.
    * Ver server/src/whatsapp/ para o novo módulo.
    * @deprecated Removido na migração para Cloud API (FASE-05)
    */

   /**
    * Stub de initClient — não inicializa mais o wwebjs.
    * @deprecated
    */
   async function initClient() {
     console.log('[zap/client] STUB: wwebjs removido. Chat via Cloud API (server/src/whatsapp/).');
   }

   /**
    * Stub de initDefaultClient — não inicializa mais o wwebjs.
    * @deprecated
    */
   async function initDefaultClient() {
     console.log('[zap/client] STUB: wwebjs removido. Chat via Cloud API (server/src/whatsapp/).');
   }

   module.exports = { initClient, initDefaultClient };
   ```

3. **Esvaziar `server/src/zap/index.js`** — substituir por:
   ```js
   /**
    * MÓDULO WWEBJS REMOVIDO
    * Listeners de message_create, message_ack e message_edit desativados.
    * O webhook /webhook/whatsapp (FASE-02) substitui esses listeners.
    * @deprecated Removido na migração para Cloud API (FASE-05)
    */

   async function initDefaultClient() {
     console.log('[zap/index] STUB: wwebjs removido. Webhook Cloud API ativo em /webhook/whatsapp.');
   }

   module.exports = { initDefaultClient };
   ```

4. **`server/src/index.js`** — garantir que a chamada `initDefaultClient` do zap não crasha:
   - Linha atual: `const { initDefaultClient } = require('./zap');` e depois `initDefaultClient();`
   - Com o stub acima, isso continuará funcionando sem erro (apenas loga o stub)
   - NÃO remover a linha — o stub é suficiente

5. **Remover sessão Chrome persistida:**
   ```bash
   # Remover pasta de sessão wwebjs (dados de autenticação do Chrome)
   # CUIDADO: backup antes se necessário
   ls /var/www/public-oregon/server/session-zap/
   rm -rf /var/www/public-oregon/server/session-zap/
   ```

6. **Verificar processos Chrome órfãos:**
   ```bash
   ps aux | grep -E "chromium|chrome|puppeteer" | grep -v grep
   # Se houver processos → matar com: kill -9 <PID>
   ```

**Arquivos prováveis afetados:**
- `server/package.json` — remover `whatsapp-web.js`
- `server/src/zap/client.js` — substituir por stub
- `server/src/zap/index.js` — substituir por stub

**Padrões a seguir:**
- Stubs exportam as mesmas funções que o módulo original (mantém compatibilidade de `require`) — sem alterar o contrato de import
- `module.exports` mantido

**Checklist de segurança específico (esta subfase):**
- [ ] Verificar que `npm uninstall whatsapp-web.js` não remove dependências compartilhadas que outros módulos usam — conferir `package.json` após uninstall
- [ ] Processo `chromium`/`puppeteer` não deve mais aparecer em `ps aux` após restart do PM2
- [ ] Pasta `session-zap/` removida — contém dados de autenticação de sessão WhatsApp; não deixar resíduos de credenciais
- [ ] Stub não lança exceção — apenas `console.log` e retorna

**Estratégia de teste:**
```bash
# Após npm uninstall e edição dos arquivos
pm2 restart oregon-node-dev
pm2 logs oregon-node-dev --lines 30 --nostream

# Deve aparecer: "[zap/client] STUB: wwebjs removido..."
# NÃO deve aparecer: "Error: Cannot find module 'whatsapp-web.js'"

# Verificar que não há Chrome rodando
ps aux | grep -E "chromium|chrome" | grep -v grep
# Esperado: nenhuma linha
```

**Critério de aceite:**
1. `pm2 logs oregon-node-dev` após restart NÃO mostra `Cannot find module 'whatsapp-web.js'`
2. `pm2 status oregon-node-dev` mostra `online`
3. Nenhum processo Chrome/Chromium/Puppeteer em `ps aux`
4. Log mostra mensagem do stub: `[zap/client] STUB: wwebjs removido`

**Comandos de verificação:**
```bash
# PM2 status e logs
pm2 restart oregon-node-dev && sleep 5 && pm2 logs oregon-node-dev --lines 30 --nostream

# Sem Chrome
ps aux | grep -E "chromium|chrome|puppeteer" | grep -v grep | wc -l
# Esperado: 0

# Package.json não tem mais wwebjs
grep "whatsapp-web" /var/www/public-oregon/server/package.json
# Esperado: sem resultado
```

**Riscos específicos:**
- `npm uninstall` no servidor com watch ativo do PM2 pode causar restart durante o uninstall e gerar erros temporários → `pm2 stop oregon-node-dev` antes do uninstall, `pm2 start` depois
- `session-zap/` pode conter subpastas com permissão root (Puppeteer cria com root) → usar `sudo rm -rf` se necessário
- Outros módulos que dependiam de `whatsapp-web.js` indiretamente → verificar `npm ls whatsapp-web.js` para ver dependentes

---

### Subfase B — Stubs TODO para Fluxos/Crons/Disparos/IA

**O que construir:** substituir todas as chamadas a `sendZapMessage`, `sendZapMessageImage` e `sendMessageChat` do wwebjs nos arquivos de fluxos, crons e CRM por stubs que logar e retornam no-op. Identificar todos os arquivos via grep e substituir sistematicamente.

**Arquivos identificados com chamadas wwebjs (resultado do grep inicial):**
- `server/src/crons.js`
- `server/src/utils/crmUtils.js`
- `server/src/flows/actions/messageActions.js`
- [outros que o grep revelar antes da implementação]

**Padrão de stub a aplicar em cada ponto:**

Para cada chamada como:
```js
const { sendZapMessage } = require('../zap/message');
// ...
await sendZapMessage(clientId, phone, text);
```

Substituir por:
```js
// TODO [CLOUD-API-MIGRATION]: migrar para messageService da Cloud API (server/src/whatsapp/messageService.js)
// Stub: não envia mensagem via wwebjs (removido). Chat funciona via Cloud API webhook.
console.warn('[stub] sendZapMessage: wwebjs removido. Implementar via messageService quando disponível.');
// return; // ou retornar valor neutro conforme o contexto
```

Se a função envolve um `try/catch`, garantir que o stub não lança exceção:
```js
try {
  // TODO [CLOUD-API-MIGRATION]: migrar para Cloud API
  console.warn('[stub] sendZapMessage: wwebjs removido.');
  return null; // retorno neutro
} catch (e) {
  // já tratado — stub nunca lança
}
```

Para `messageActions.js` em fluxos — o stub deve retornar uma Promise resolvida:
```js
/**
 * @deprecated wwebjs removido. TODO: migrar para messageService (Cloud API).
 */
async function sendMessage(params) {
  console.warn('[stub/messageActions] sendMessage: wwebjs removido. TODO: migrar para Cloud API.');
  return { success: false, stub: true };
}
```

**Passos:**

1. Grep completo para localizar todos os pontos:
   ```bash
   grep -rn "sendZapMessage\|sendZapMessageImage\|sendMessageChat\|require.*zap/message\|require.*zap/client\|require.*zap/chats\|getClientId\|initClient\b" \
     /var/www/public-oregon/server/src/ --include="*.js" \
     --exclude-dir=zap
   ```

2. Para cada arquivo encontrado:
   - Substituir o `require` do zap por comentário `// TODO [CLOUD-API-MIGRATION]:`
   - Substituir a chamada pela mensagem de stub
   - Garantir que nenhum código subsequente assume o retorno real (ex: `if (result.msg_id)` → tratar caso `stub: true`)

3. Verificar especificamente `server/src/flows/actions/messageActions.js` — este arquivo é importado pelo `aiProcessor.js` e pelos nós de fluxo; o stub deve manter a assinatura mas retornar no-op

**Arquivos prováveis afetados:**
- `server/src/crons.js`
- `server/src/utils/crmUtils.js`
- `server/src/flows/actions/messageActions.js`
- [outros identificados pelo grep]

**Padrões a seguir:**
- Comentário `// TODO [CLOUD-API-MIGRATION]:` padronizado — facilita grep futuro para encontrar todos os stubs
- Stub nunca usa `throw` — apenas `console.warn` + retorno neutro
- Manter a assinatura da função (mesmos parâmetros) — não quebrar o caller

**Checklist de segurança específico (esta subfase):**
- [ ] Stub não lança exceção não tratada (`throw`) — verificar que todos os stubs usam apenas `console.warn` + `return`
- [ ] Stub não executa código que poderia ter efeito colateral perigoso (ex: não chamar APIs externas, não gravar no banco com dados corrompidos)
- [ ] `require` de `../zap/message` e `../zap/client` removidos de arquivos fora do diretório `zap/` — não deixar require de módulo morto
- [ ] Verificar que fluxos de IA (`aiProcessor.js`) não crasham com stub — o fluxo deve continuar mas não enviar mensagem

**Estratégia de teste:**
```bash
# Verificar que nenhuma referência wwebjs sobrou fora de /zap/
grep -rn "require.*zap/message\|require.*zap/client\|sendZapMessage\b\|sendZapMessageImage\b" \
  /var/www/public-oregon/server/src/ --include="*.js" \
  --exclude-dir=zap
# Esperado: apenas comentários TODO

# PM2 sem erros após modificações
pm2 restart oregon-node-dev
pm2 logs oregon-node-dev --lines 30 --nostream
```

**Critério de aceite:**
1. `grep -rn "require.*zap/message\|sendZapMessage\b" server/src/ --exclude-dir=zap` retorna apenas linhas de comentário TODO
2. PM2 `online` sem `TypeError` ou `ReferenceError` após restart
3. Fluxo de teste via API de teste (`/apidev/flow-test/simulate-message`) não gera `uncaught exception` (pode gerar `[stub]` warning no log — isso é esperado)

**Comandos de verificação:**
```bash
# Referências externas ao zap/
grep -rn "require.*'.*zap/message'\|require.*'.*zap/client'\|sendZapMessage\b" \
  /var/www/public-oregon/server/src/ --include="*.js" \
  --exclude-dir=zap | grep -v "^\s*//"

# Testar fluxo (smoke — deve funcionar sem crash mesmo com stub)
curl -X POST https://app.oregonservicos.com.br/apidev/flow-test/simulate-message \
  -H "Content-Type: application/json" \
  -d '{"phone":"5541871978546","text":"Olá, teste stub"}'

# PM2
pm2 status oregon-node-dev
pm2 logs oregon-node-dev --lines 20 --nostream
```

**Riscos específicos:**
- `messageActions.js` pode ser chamado em loop pelos fluxos — o stub deve retornar rapidamente (sem await desnecessário) para não congelar o fluxo
- `crons.js` pode tentar enviar mensagens para listas de clientes — o stub deve ser silencioso para não poluir o log com centenas de warnings; considerar logar apenas a primeira ocorrência por tipo de envio via variável de controle ou simplesmente remover o `console.warn` em produção

---

### Subfase C — Limpeza de Rotas/Instâncias Obsoletas

**O que construir:** remover ou retornar 410 (Gone) para as rotas wwebjs que não fazem mais sentido, parar de ler/escrever na tabela `Clients`, e verificar boot limpo do PM2.

**Rotas a aposentar em `server/src/routes/zap-route.js`:**

Rotas wwebjs que não têm equivalente na Cloud API e devem retornar 410:
- `POST /zap/connect`
- `POST /zap/disconnect`
- `GET /zap/check-conn`
- `GET /zap/clients`
- `POST /zap/clients`
- `DELETE /zap/clients/:id`

Substituir cada handler por:
```js
router.post('/connect', (req, res) => {
  return res.status(410).json({
    error: 'MIGRADO',
    message: 'Conexão via QR code removida. Configure o WhatsApp Cloud API em /whatsapp/config.'
  });
});
```

Rotas que PERMANECEM e foram reescritas (não retornar 410):
- `GET /zap/allChats` ✅ (reescrita na FASE-03)
- `GET /zap/getChat/:id` ✅ (reescrita na FASE-03)
- `POST /zap/send-message-chat` ✅ (reescrita na FASE-03)
- `POST /zap/save-anexo` ✅ (reescrita na FASE-03)
- `GET /zap/window-status/:id` ✅ (criada na FASE-03)

Rotas que são TODO (stub 503) — existem mas a implementação completa é futura:
- `POST /zap/send-message` (envio de mensagem via disparo/automação — não chat) → 503 + mensagem TODO
- `POST /zap/editar-msg` → 503 + mensagem TODO (Cloud API tem limitações para edição)
- `GET /zap/actions-chat/:id`, `GET /zap/actions-msg/:id` → 503 + mensagem TODO

**Tabela `Clients` (wwebjs):**
- NÃO dropar a tabela — preservar dados históricos
- NÃO inserir novos registros
- Remover qualquer código que ainda insere em `Clients` (verificar com grep)

```bash
grep -rn "INSERT.*Clients\|UPDATE.*Clients\|Clients.*INSERT" \
  /var/www/public-oregon/server/src/ --include="*.js"
# Resultado: remover/comentar cada linha encontrada
```

**Verificação final de boot:**

```bash
pm2 restart oregon-node-dev
sleep 5
pm2 logs oregon-node-dev --lines 50 --nostream
```

O log deve:
- Mostrar: `[zap/client] STUB: wwebjs removido`
- Mostrar: `[zap/index] STUB: wwebjs removido`
- NÃO mostrar: `Error: Cannot find module`
- NÃO mostrar: `ChromeLauncher`
- NÃO mostrar: `Unhandled rejection`

**Arquivos prováveis afetados:**
- `server/src/routes/zap-route.js` — aposentar rotas connect/disconnect/check-conn/clients

**Padrões a seguir:**
- HTTP 410 Gone — semanticamente correto para recursos removidos permanentemente
- HTTP 503 Service Unavailable — para funcionalidades TODO que voltarão futuramente
- Mensagem de erro clara com instrução de migração

**Checklist de segurança específico (esta subfase):**
- [ ] Rotas 410 NÃO retornam stack trace — apenas `{ error: 'MIGRADO', message: '...' }` (sem `e.message`)
- [ ] Sem `INSERT INTO Clients` remanescente no código — verificar com grep
- [ ] Sem `require` de `whatsapp-web.js` em qualquer arquivo fora do `zap/` (que já está neutralizado)
- [ ] `pm2 logs` sem `UnhandledPromiseRejectionWarning` relacionado ao wwebjs

**Estratégia de teste:**
```bash
TOKEN="SEU_TOKEN"
# Rotas aposentadas devem retornar 410
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  https://app.oregonservicos.com.br:3005/zap/connect
# Esperado: 410

curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  https://app.oregonservicos.com.br:3005/zap/check-conn
# Esperado: 410

# Rota de chat ainda funciona (reescrita na FASE-03)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  https://app.oregonservicos.com.br:3005/zap/allChats
# Esperado: 200
```

**Critério de aceite:**
1. `POST /zap/connect` retorna `410` com mensagem de migração
2. `GET /zap/check-conn` retorna `410`
3. `GET /zap/allChats` ainda retorna `200` (rota preservada)
4. `SELECT COUNT(*) FROM Clients;` retorna o mesmo número que antes (nenhum novo insert)
5. PM2 `online` sem erros wwebjs no log

**Comandos de verificação:**
```bash
TOKEN=$(curl -s -X POST https://app.oregonservicos.com.br:3005/conta/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a23comunicacoes@gmail.com","password":"teste","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")

# Verificar rotas aposentadas
for ROTA in "POST /zap/connect" "GET /zap/check-conn" "GET /zap/clients"; do
  METHOD=$(echo $ROTA | cut -d' ' -f1)
  PATH=$(echo $ROTA | cut -d' ' -f2)
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X $METHOD \
    -H "Authorization: Bearer $TOKEN" \
    "https://app.oregonservicos.com.br:3005$PATH")
  echo "$ROTA → $CODE (esperado: 410)"
done

# Chat funcionando
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://app.oregonservicos.com.br:3005/zap/allChats"

# PM2 limpo
pm2 logs oregon-node-dev --lines 30 --nostream | grep -iE "error|unhandled|cannot find|chromium|puppeteer"
# Esperado: sem resultado (ou apenas linhas de stub)

# Banco: sem insert recente em Clients
mysql -h 191.101.78.114 -u dboregonsys_user -p'DB@OregonSys93219' DEVdboregonsys \
  -e "SELECT COUNT(*) AS total_clients FROM Clients;"
```

**Riscos específicos:**
- Rota `/zap/editar-msg` pode ser chamada por outras partes do frontend (não apenas chat.vue) → verificar com grep antes de retornar 503
- `Clients` table pode ser referenciada em relatórios/queries SQL em outros módulos → grep `FROM Clients` e `JOIN Clients` antes de parar de escrever (não quebrar leitura de dados históricos)

---

## Critério de aceite da fase (validado depois de TODAS as subfases)

1. `pm2 status oregon-node-dev` mostra `online` após restart completo
2. `pm2 logs` sem `Cannot find module 'whatsapp-web.js'` e sem `Unhandled` relacionado ao wwebjs
3. `ps aux | grep chromium | grep -v grep | wc -l` retorna `0`
4. `GET /zap/allChats` retorna `200` (Cloud API ativo)
5. `POST /zap/connect` retorna `410`
6. Fluxo de teste (`/apidev/flow-test/simulate-message`) não gera `uncaught exception`

## Riscos da fase

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `npm uninstall whatsapp-web.js` remove dependência compartilhada usada em outro módulo | Alto | Verificar `npm ls whatsapp-web.js` antes; o wwebjs tende a ter dependências únicas |
| Processo Chrome não morre após remover wwebjs — consome CPU/RAM indefinidamente | Médio | `pm2 stop` + `kill -9` + `rm -rf session-zap/` + `pm2 start` |
| Stub em `messageActions.js` retorna `{success:false}` e o fluxo AI interpreta como falha → comportamento inesperado | Médio | Verificar como `aiProcessor.js` usa o retorno de `sendMessage`; ajustar stub para não gerar estado de erro no fluxo |
| Rotas 410 sem `getUserLoggedUser` podem ser acessadas sem auth | Baixo | Manter `getUserLoggedUser` nas rotas 410 (o middleware já está no `app.use('/zap', getUserLoggedUser, ...)`) |

## Comandos de verificação da fase

```bash
# Verificação completa pós-fase

# 1. PM2 online
pm2 status oregon-node-dev

# 2. Sem Chrome
ps aux | grep -E "chromium|chrome|Chromium" | grep -v grep

# 3. Sem wwebjs no node_modules
ls /var/www/public-oregon/server/node_modules/ | grep whatsapp
# Esperado: sem resultado

# 4. Log limpo
pm2 logs oregon-node-dev --lines 50 --nostream | grep -iE "unhandled|cannot find|chromium"
# Esperado: sem resultado

# 5. Chat funciona
TOKEN=$(curl -s -X POST https://app.oregonservicos.com.br:3005/conta/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a23comunicacoes@gmail.com","password":"teste","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")

curl -s -o /dev/null -w "allChats: %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" "https://app.oregonservicos.com.br:3005/zap/allChats"

curl -s -o /dev/null -w "connect (deve ser 410): %{http_code}\n" -X POST \
  -H "Authorization: Bearer $TOKEN" "https://app.oregonservicos.com.br:3005/zap/connect"

# 6. Fluxo de teste (sem uncaught exception)
curl -s -X POST https://app.oregonservicos.com.br/apidev/flow-test/simulate-message \
  -H "Content-Type: application/json" \
  -d '{"phone":"5541871978546","text":"Teste pós-remoção wwebjs"}' | python3 -m json.tool
```

## Log da fase (marcar durante execução)

- [x] Subfase A concluída — wwebjs removido dos módulos zap (stubs preservam os 38 exports)
- [x] Subfase B concluída — consumidores (crons/disparos/flows/IA) com TODO [ASSUMPTION-AUTOPILOT], stubs no-op não crasham
- [x] Subfase C concluída — rotas connect/disconnect/check-conn/clients → 410; whatsapp-web.js removido do package.json + node_modules (npm uninstall)
- [x] Critério de aceite da fase verificado — grep de require zerado; boot limpo (sem Cannot find module); regressão: allChats 200, config 200, connect 410, webhook 403, login 200
- [x] Security review consolidado ✅ — stubs não lançam exceção; rotas aposentadas sem stack trace; nenhum dado apagado (Clients/session-zap preservados)
- [x] Quality review consolidado ✅ — interface de exports preservada (zero quebra de call site); Chrome órfão morto
- [x] Commit feito (hash registrado no log)
- [x] Log atualizado em [`../10-LOG-EXECUCAO.md`](../10-LOG-EXECUCAO.md)
- [x] Autorização para próxima fase — **AUTOPILOT** (última fase da SPEC)
