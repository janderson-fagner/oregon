# FASE 04 — Frontend: Config Meta + Ajustes do Chat

**Duração estimada:** 4h — 6h  
**Dependências:** FASE-03 (todas as rotas backend funcionando: `/whatsapp/config`, `/whatsapp/templates`, `/zap/allChats`, `/zap/getChat`, `/zap/send-message-chat`, `/zap/window-status`)  
**Entregável:** formulário de credenciais Meta (substitui QR code), chat com banner de janela 24h, modal de envio de templates, indicadores de status (enviado/entregue/lido/falhou) e limpeza dos componentes wwebjs da UI.

> **NOTA PARA O BUILDER:** esta fase tem forte dependência do contexto visual do projeto (Vuexy + Vuetify + ícones Tabler). Antes de implementar qualquer componente, ler o arquivo `client/src/pages/apps/crm/chat.vue` completo para entender a estrutura atual. Seguir FIELMENTE o padrão de design do CLAUDE.md: `<AppDrawerHeaderSection>` em dialogs, `<IconBtn>` para botões de ícone, dialogs no padrão `VDialog > VCard > VCardText > AppDrawerHeaderSection`, botões de ação em `<div class="d-flex flex-row align-center justify-end">` (NÃO usar `<VCardActions>`). Chamadas de API via `$api()` (não axios direto).

## Objetivo

Adaptar o frontend para a nova arquitetura Cloud API: substituir a tela de conexão por QR code por um formulário de credenciais Meta, ajustar o chat para ler das novas APIs, exibir indicadores de janela 24h, permitir envio de templates e mostrar status de entrega por mensagem. Esta fase é a que o usuário final vê — qualidade visual e UX são críticos.

## Research relevante

Ver [`../02-RESEARCH.md`](../02-RESEARCH.md) seções 7.5 (janela 24h — UX), 7.8 (templates APPROVED), padrões frontend (Vuexy/Vuetify/Tabler, `$api()`).

## Subfases

> Cada subfase é construída por um subagent Sonnet 4.6 (medium effort) e validada pelo modelo da sessão. Ordem importa — não pular.

---

### Subfase A — Tela de Config Meta (Substitui QR)

**O que construir:** substituir o componente de QR code/conexão wwebjs por um formulário de configuração das credenciais Meta. Identificar onde está a tela de configuração atual (possivelmente `client/src/pages/apps/crm/` ou nas configurações do sistema) e substituir por formulário novo.

[ASSUMPTION: a tela de configuração do WhatsApp/wwebjs existe como componente ou página separada do `chat.vue` — verificar com `grep -rl "QRCode\|qr_code\|check-conn\|connect\|disconnect" client/src/pages/` antes de implementar. Se estiver embutida no `chat.vue`, extrair para componente separado.]

**Componente/formulário de config Meta** (criar em `client/src/pages/apps/crm/WhatsappConfig.vue` ou onde existir o componente atual):

Campos do formulário:
- `display_phone_number` — Número de exibição (ex: +55 41 99999-0000) — VTextField, tipo text
- `phone_number_id` — Phone Number ID (obrigatório) — VTextField, tipo text
- `waba_id` — WABA ID (obrigatório) — VTextField, tipo text
- `access_token` — Access Token (write-only) — VTextField, `type="password"`, `autocomplete="new-password"`, placeholder "••••••••" (NÃO pré-preencher com valor salvo)
- `app_secret` — App Secret (write-only) — VTextField, `type="password"`, `autocomplete="new-password"`
- `verify_token` — Verify Token (write-only) — VTextField, `type="password"`, `autocomplete="new-password"`
- `graph_api_version` — Versão da API (opcional, default v23.0) — VTextField

Além dos campos de configuração, exibir:
- URL do Webhook: `https://app.oregonservicos.com.br:3005/webhook/whatsapp` (ou valor retornado pela API no campo `webhook_url`) — VTextField readonly com botão "Copiar" (`<VBtn>` com ícone `tabler-copy` que chama `navigator.clipboard.writeText`)
- Chip de status: `ativo = true` → chip verde "Conectado"; `ativo = false` → chip vermelho "Desconectado"

Botões (em `<div class="d-flex flex-row align-center justify-end gap-2">`):
- `<VBtn color="error" variant="outlined" @click="removerConfig">Remover Configuração</VBtn>`
- `<VBtn color="primary" :loading="salvando" @click="salvarConfig">Salvar</VBtn>`

Calls de API:
```js
// Carregar config existente (GET — tokens não vêm, apenas metadados)
const { data } = await $api('/whatsapp/config');
// data: { phone_number_id, waba_id, display_phone_number, graph_api_version, ativo, webhook_url }

// Salvar (POST — incluir todos os campos; campos write-only: enviar apenas se preenchidos)
await $api('/whatsapp/config', {
  method: 'POST',
  body: { phone_number_id, waba_id, access_token, app_secret, verify_token, display_phone_number, graph_api_version }
});

// Remover (DELETE)
await $api('/whatsapp/config', { method: 'DELETE' });
```

**Padrão de dialog** (se o formulário for exibido em dialog):
```html
<VDialog v-model="dialogConfig" max-width="600">
  <VCard>
    <VCardText>
      <AppDrawerHeaderSection title="Configuração WhatsApp Cloud API" @cancel="dialogConfig = false" />
      <!-- campos do formulário -->
      <div class="d-flex flex-row align-center justify-end gap-2 mt-4">
        <VBtn color="error" variant="outlined" @click="removerConfig">Remover</VBtn>
        <VBtn @click="dialogConfig = false">Cancelar</VBtn>
        <VBtn color="primary" :loading="salvando" @click="salvarConfig">Salvar</VBtn>
      </div>
    </VCardText>
  </VCard>
</VDialog>
```

**Arquivos prováveis afetados:**
- `client/src/pages/apps/crm/WhatsappConfig.vue` — criar ou modificar componente existente
- `client/src/pages/apps/crm/chat.vue` — remover referências ao componente de QR/conexão, adicionar link/botão para a nova config

**Padrões a seguir:**
- `<AppDrawerHeaderSection>` em dialogs (CLAUDE.md)
- `<IconBtn>` para botões de ícone (CLAUDE.md)
- `$api()` para chamadas HTTP (padrão do frontend — verificar como é usado no `chat.vue` atual)
- VTextField com `type="password"` para campos sensíveis — NUNCA usar `v-model` que pré-preenche com valor existente
- Ícones Tabler: `tabler-copy`, `tabler-brand-whatsapp`, `tabler-settings`

**Checklist de segurança específico (esta subfase):**
- [ ] `access_token`, `app_secret`, `verify_token` NUNCA pré-preenchidos no formulário (mesmo que a API retornasse — e não retorna)
- [ ] Campos de token usam `type="password"` e `autocomplete="new-password"` — evitar que o browser salve o token
- [ ] Se usuário não preencher campo write-only ao editar, NÃO enviar o campo para a API (ou enviar vazio e o backend ignora campos vazios no update) — [ASSUMPTION: o backend na FASE-00 não sobrescreve token se o campo for vazio/null; verificar comportamento do `configService.saveConfig`]
- [ ] URL do webhook copiada para clipboard — não há risco de XSS aqui pois é texto fixo da API
- [ ] Mensagem de aviso visual: "⚠️ Use sempre um System User Token de longa duração (não expira). Tokens de usuário expiram em ~60 dias e desativam o chat."

**Estratégia de teste:**
- Smoke manual:
  1. Acessar a página de configuração no browser
  2. Salvar credenciais (phone_number_id, waba_id, access_token, app_secret, verify_token)
  3. Verificar que o formulário NÃO exibe o token após salvar (recarregar página)
  4. Verificar que a URL do webhook está visível e o botão copiar funciona
  5. Clicar em Remover e verificar que o chip muda para "Desconectado"

**Critério de aceite:**
1. Formulário salva via `POST /whatsapp/config` e exibe toast de sucesso
2. Ao recarregar, campos de token estão VAZIOS (write-only confirmado)
3. URL do webhook é copiada ao clicar no botão
4. Componente de QR code / conexão wwebjs não está mais visível na UI

**Comandos de verificação:**
```bash
# Verificar que o componente de QR foi substituído
grep -rn "QRCode\|qr_code\|qr-code\|check-conn" /var/www/public-oregon/client/src/ --include="*.vue"
# Esperado: zero ou apenas no componente removido/inativo

# Verificar existência do novo componente
ls /var/www/public-oregon/client/src/pages/apps/crm/ | grep -i whatsapp
```

**Riscos específicos:**
- Componente de QR pode estar embutido no `chat.vue` (não em arquivo separado) → verificar antes de remover; extrair em componente separado antes de deletar
- `$api()` pode não aceitar body como objeto no DELETE — usar GET para buscar e POST para upsert; para delete verificar como outros componentes fazem (ex: ver um delete existente no CRM)

---

### Subfase B — Chat: Janela 24h, Templates, Status

**O que construir:** modificar `client/src/pages/apps/crm/chat.vue` para:
1. Mostrar banner/indicador de janela 24h na cabeça do chat
2. Bloquear o input de texto quando a janela está fechada
3. Botão "Enviar Template" que abre modal de seleção
4. Ícones de status por mensagem (enviado/entregue/lido/falhou)
5. Manter socket `nova-mensagem` / `update-mensagem` funcionando com a nova estrutura

**1. Banner de janela 24h** (abaixo do header da conversa):
```html
<!-- Mostrar apenas quando windowStatus carregado -->
<VAlert v-if="windowStatus && !windowStatus.windowOpen" type="warning" variant="tonal" class="ma-2">
  <template #text>
    Janela de atendimento encerrada. O cliente não enviou mensagens nas últimas 24h.
    Use um template para retomar o contato.
  </template>
  <template #append>
    <VBtn size="small" color="warning" @click="abrirModalTemplate">Enviar Template</VBtn>
  </template>
</VAlert>

<!-- Chip de tempo restante quando janela está aberta -->
<div v-if="windowStatus?.windowOpen" class="d-flex align-center px-3 py-1">
  <VChip size="small" color="success" prepend-icon="tabler-clock">
    Janela ativa: {{ horasRestantes }}h restantes
  </VChip>
</div>
```

**2. Bloquear input quando janela fechada:**
```html
<VTextField
  v-model="mensagem"
  :disabled="windowStatus && !windowStatus.windowOpen"
  :placeholder="windowStatus && !windowStatus.windowOpen ? 'Janela encerrada — use um template' : 'Digite uma mensagem...'"
/>
```

**3. Modal de templates** (`dialogTemplate`):
```html
<VDialog v-model="dialogTemplate" max-width="600">
  <VCard>
    <VCardText>
      <AppDrawerHeaderSection title="Enviar Template" @cancel="dialogTemplate = false" />

      <!-- Seleção de template -->
      <VSelect
        v-model="templateSelecionado"
        :items="templates"
        item-title="name"
        item-value="name"
        label="Template"
        return-object
        class="mb-3"
      />

      <!-- Parâmetros dinâmicos {{1}}, {{2}}, etc. -->
      <div v-if="parametrosTemplate.length > 0">
        <VTextField
          v-for="(_, i) in parametrosTemplate"
          :key="i"
          v-model="parametrosTemplate[i]"
          :label="`Parâmetro {{${i + 1}}}`"
          class="mb-2"
        />
      </div>

      <!-- Preview do idioma -->
      <VChip v-if="templateSelecionado" size="small" class="mb-3">
        {{ templateSelecionado.language?.code || '' }}
      </VChip>

      <div class="d-flex flex-row align-center justify-end gap-2 mt-2">
        <VBtn @click="dialogTemplate = false">Cancelar</VBtn>
        <VBtn color="primary" :loading="enviandoTemplate" @click="enviarTemplate">Enviar</VBtn>
      </div>
    </VCardText>
  </VCard>
</VDialog>
```

Lógica de templates:
```js
// Carregar templates ao abrir modal
async function abrirModalTemplate() {
  dialogTemplate.value = true;
  const { data } = await $api('/whatsapp/templates');
  templates.value = data.templates || [];
}

// Detectar parâmetros {{n}} no template selecionado
watch(templateSelecionado, (tmpl) => {
  if (!tmpl) { parametrosTemplate.value = []; return; }
  const body = tmpl.components?.find(c => c.type === 'BODY')?.text || '';
  const matches = body.match(/\{\{\d+\}\}/g) || [];
  parametrosTemplate.value = new Array(matches.length).fill('');
});

// Enviar template
async function enviarTemplate() {
  enviandoTemplate.value = true;
  const components = parametrosTemplate.value.length > 0 ? [{
    type: 'body',
    parameters: parametrosTemplate.value.map(v => ({ type: 'text', text: v }))
  }] : [];
  await $api('/whatsapp/templates/send', {
    method: 'POST',
    body: {
      conversationId: conversaAtual.value.id,
      templateName: templateSelecionado.value.name,
      languageCode: templateSelecionado.value.language?.code || 'pt_BR',
      components
    }
  });
  dialogTemplate.value = false;
  enviandoTemplate.value = false;
}
```

**4. Ícones de status por mensagem:**
```html
<!-- Dentro do bubble de cada mensagem outbound (fromMe) -->
<span v-if="msg.fromMe" class="msg-status">
  <VIcon v-if="msg.status === 'pending'" icon="tabler-clock" size="12" color="grey" />
  <VIcon v-else-if="msg.status === 'sent'" icon="tabler-check" size="12" color="grey" />
  <VIcon v-else-if="msg.status === 'delivered'" icon="tabler-checks" size="12" color="grey" />
  <VIcon v-else-if="msg.status === 'read'" icon="tabler-checks" size="12" color="primary" />
  <VIcon v-else-if="msg.status === 'failed'" icon="tabler-x" size="12" color="error" />
</span>
```

**5. Socket `update-mensagem`** — atualizar status de mensagem existente:
```js
// No setup() ou onMounted
socket.on('update-mensagem', ({ wamid, status, media_path }) => {
  const msg = mensagens.value.find(m => m.wamid === wamid);
  if (msg) {
    if (status) msg.status = status;
    if (media_path) msg.media_path = media_path; // mídia baixada em background
  }
});
```

**Carregar windowStatus ao abrir conversa:**
```js
async function carregarStatus(conversationId) {
  try {
    const { data } = await $api(`/zap/window-status/${conversationId}`);
    windowStatus.value = data;
  } catch (e) {
    windowStatus.value = null;
  }
}
```

**Arquivos prováveis afetados:**
- `client/src/pages/apps/crm/chat.vue` — modificar (seções: header da conversa, input, modals, mensagens)

**Padrões a seguir:**
- `<AppDrawerHeaderSection>` nos dialogs (CLAUDE.md)
- Dialogs no padrão `VDialog > VCard > VCardText > AppDrawerHeaderSection` + botões em `<div>` sem `<VCardActions>`
- Ícones Tabler: `tabler-check`, `tabler-checks`, `tabler-clock`, `tabler-x`, `tabler-template`
- `$api()` para todas as chamadas (nunca axios direto no frontend)
- Escapar conteúdo de mensagens ao renderizar — usar `v-text` ou escapar via `{{ texto }}` (Vue escapa por padrão; evitar `v-html` com conteúdo de usuário)

**Checklist de segurança específico (esta subfase):**
- [ ] `v-html` NUNCA usado com conteúdo de mensagem — usar `{{ msg.body }}` ou `v-text` (Vue escapa automaticamente — prevenção de XSS)
- [ ] Parâmetros do template (`parametrosTemplate`) sanitizados antes de enviar — trim e limitar tamanho a 1024 chars
- [ ] `windowStatus` pode ser `null` (request falhou) — tratar no template com `v-if="windowStatus"` para não quebrar a UI
- [ ] Ao fechar o modal de template, limpar `templateSelecionado` e `parametrosTemplate` — evitar envio acidental de dados antigos

**Estratégia de teste:**
- Smoke manual:
  1. Abrir chat com conversa que tem `last_inbound_at` há > 24h → deve mostrar banner de janela encerrada e input bloqueado
  2. Clicar "Enviar Template" → modal deve abrir com lista de templates APPROVED
  3. Selecionar template com parâmetro → campo de parâmetro deve aparecer
  4. Enviar template → conversa deve receber nova mensagem via socket
  5. Mensagem outbound deve mostrar ícone de status (tabler-clock → tabler-check → tabler-checks)

**Critério de aceite:**
1. Banner de janela encerrada visível quando `windowOpen = false`
2. Input de texto desabilitado quando `windowOpen = false`
3. Modal de templates abre, lista templates APPROVED, permite selecionar e enviar
4. Ícones de status visíveis em mensagens outbound (pelo menos `tabler-clock` para pending)
5. `socket.on('update-mensagem')` atualiza o status da mensagem em tempo real

**Comandos de verificação:**
```bash
# Verificar que v-html não é usado com corpo de mensagem
grep -n "v-html" /var/www/public-oregon/client/src/pages/apps/crm/chat.vue | grep -v "<!--"
# Esperado: zero ocorrências com conteúdo de mensagem (msg.body, texto, etc.)

# Verificar que $api é usado (não axios direto)
grep -n "axios\b" /var/www/public-oregon/client/src/pages/apps/crm/chat.vue
# Esperado: zero ou apenas comentários
```

**Riscos específicos:**
- `chat.vue` é um arquivo grande e complexo — modificar com cuidado para não quebrar funcionalidades existentes (lista de contatos, scroll, gravação de áudio)
- Gravador de áudio do chat.vue pode já usar `save-anexo` — verificar se continua funcionando com a nova rota (deveria, pois a rota mantém o mesmo path)
- Templates sem parâmetros não devem mostrar campos de parâmetro — verificar `watch(templateSelecionado)` para o caso de template sem `{{n}}`

---

### Subfase C — Limpeza da UI Antiga

**O que construir:** remover ou desativar todos os componentes, botões e referências de UI que dependem de wwebjs: QR code, botões de connect/disconnect, check-conn, e lógica de "clients" (atendimento/disparos). Garantir que nenhuma credencial trafega em query string ou log no frontend.

Itens a remover/substituir:
- Componente de QR Code (se ainda existir após Subfase A)
- Botões de "Conectar" e "Desconectar" WhatsApp
- Indicador de status de conexão baseado em wwebjs (ex: "Conectado", "QR pendente", "Reconectando")
- Referências a `GET /zap/check-conn`, `POST /zap/connect`, `POST /zap/disconnect`, `GET /zap/clients`
- Variáveis reativas como `statusConexao`, `qrCode`, `clientAtendimento`, `clientDisparos`
- Substituir status de conexão por indicador simples: "Configurado" ou "Não configurado" com link para a nova tela de config Meta

[ASSUMPTION: alguns desses componentes podem estar em arquivo separado (ex: `WhatsappConnect.vue`, `ZapStatus.vue` ou embutidos em `chat.vue`) — verificar com `grep -rl "qr\|check-conn\|connect\|disconnect\|clientAtendimento" client/src/`]

Substituições sugeridas:
- Onde havia botão "Conectar WhatsApp" → botão "Configurar WhatsApp Cloud API" que navega para a nova página de config
- Onde havia indicador de status wwebjs → chip simples "Cloud API ativo" / "Não configurado" baseado no `GET /whatsapp/config`

**Arquivos prováveis afetados:**
- `client/src/pages/apps/crm/chat.vue` — remover referências a connect/disconnect/qr
- Outros componentes Vue com referências a QR/wwebjs (localizar com grep)

**Padrões a seguir:**
- Não deletar arquivos Vue sem verificar se há outras referências (imports em outros componentes ou router)
- Se o componente for importado em outros lugares, apenas esvaziar/substituir o conteúdo — não deletar o arquivo

**Checklist de segurança específico (esta subfase):**
- [ ] Nenhuma credencial (token, app_secret) aparece em URL (query string) no frontend — verificar toda navegação/redirecionamento
- [ ] `console.log` de dados de configuração removido do código Vue — `console.log(config)` pode expor tokens no DevTools
- [ ] Código de debug de QR code / token de sessão wwebjs removido — não deixar `console.log(qrCode)` ou similar

**Estratégia de teste:**
- Inspeção visual: abrir o chat no browser e verificar que não há botão de QR/connect/disconnect
- DevTools Network: nenhuma chamada para `/zap/check-conn`, `/zap/connect` ou `/zap/clients`
- DevTools Console: nenhum erro relacionado a endpoints removidos

**Critério de aceite:**
1. Browser não faz chamadas para `/zap/check-conn`, `/zap/connect` ou `/zap/disconnect` (verificar Network DevTools)
2. Nenhum componente de QR code visível na UI
3. Nenhum `console.log` com token ou credencial no código-fonte Vue (grep)
4. PM2 sem erros de 404 para as rotas removidas da UI

**Comandos de verificação:**
```bash
# Verificar referências remanescentes
grep -rn "check-conn\|/zap/connect\|/zap/disconnect\|qrCode\|QRCode\|clientAtendimento\|clientDisparos" \
  /var/www/public-oregon/client/src/ --include="*.vue" --include="*.js" --include="*.ts"

# Verificar console.log com dados sensíveis
grep -rn "console\.log.*token\|console\.log.*secret\|console\.log.*config" \
  /var/www/public-oregon/client/src/ --include="*.vue"
```

**Riscos específicos:**
- Componente de chat pode ter watchers ou lifecycle hooks que chamam rotas wwebjs ao montar — garantir que todos os `onMounted`, `watch` e timers que chamavam wwebjs foram removidos ou substituídos
- Router guard ou middleware de autenticação pode fazer chamada de verificação de conexão wwebjs — verificar `client/src/router/` e `client/src/middleware/`

---

## Critério de aceite da fase (validado depois de TODAS as subfases)

1. Formulário de config Meta acessível, salva credenciais via `POST /whatsapp/config`, e campos de token ficam em branco ao recarregar
2. Chat mostra banner de janela encerrada e bloqueia input quando `windowOpen = false`
3. Modal de templates funciona: lista templates APPROVED e permite envio com parâmetros
4. Ícones de status (tabler-clock/check/checks) visíveis em mensagens outbound
5. Nenhuma chamada para endpoints wwebjs no Network DevTools
6. Nenhum componente de QR visível

## Riscos da fase

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `chat.vue` é muito grande — modificação quebra funcionalidades existentes (scroll, gravador) | Alto | Fazer modificações incrementais; testar após cada subfase; não remover código que não foi identificado como wwebjs |
| Templates sem parâmetros mostram campo de parâmetro erroneamente | Médio | `watch(templateSelecionado)` deve verificar se há `{{n}}` no body antes de criar campos |
| `v-html` com conteúdo de mensagem → XSS | Alto | Grep explícito em `chat.vue` por `v-html`; substituir por `{{ }}` ou `v-text` |
| Campos de token pré-preenchidos por autocomplete do browser | Médio | `autocomplete="new-password"` em todos os campos de token |

## Comandos de verificação da fase

```bash
# Referências wwebjs removidas
grep -c "check-conn\|qrCode\|QRCode\|clientAtendimento" /var/www/public-oregon/client/src/pages/apps/crm/chat.vue
# Esperado: 0

# v-html com mensagem — deve ser 0
grep -n "v-html.*body\|v-html.*texto\|v-html.*msg" /var/www/public-oregon/client/src/pages/apps/crm/chat.vue

# PM2 ok
pm2 status oregon-node-dev

# Build sem erros (se aplicável)
# cd /var/www/public-oregon/client && npm run build 2>&1 | tail -5
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
