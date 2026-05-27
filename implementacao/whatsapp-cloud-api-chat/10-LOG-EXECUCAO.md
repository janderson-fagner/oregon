# 10 — Log de Execução

Log vivo da execução desta SPEC. Cada subfase concluída adiciona uma entrada. **Não delete entradas anteriores** — mesmo se o resultado mudou depois.

## Formato de entrada (subfase)

```markdown
## YYYY-MM-DD HH:mm — FASE-XX subfase Y — <título>

- Construção: builder agent (Sonnet 4.6 medium) | <override>
- Início: HH:mm
- Conclusão: HH:mm
- Arquivos: <lista>
- Testes executados: <comando> → <resultado>
- Segurança: ✅ aprovado | ⚠️ ajustado | ❌ bloqueio
  - <itens não-óbvios verificados ou corrigidos>
- Qualidade: ✅ aprovado | ⚠️ ajustado | ❌ bloqueio
  - <itens>
- Validação final (critério de aceite): <resultado>
- Evidências: <paths em evidencias/, screenshots, dumps, etc.>
- Notas: <decisões, blockers, links>
- Resultado: ✅ ok | ⚠️ parcial | ❌ falhou
```

## Formato de entrada (fechamento de fase)

```markdown
## YYYY-MM-DD HH:mm — FASE-XX FECHADA

- Subfases concluídas: A, B, C, ...
- Critério de aceite da fase: <resultado>
- Segurança (consolidado): ✅ aprovado
- Qualidade (consolidado): ✅ aprovado
- Commit: <hash> — `<tipo>(<escopo>): FASE-XX — <título>`
- Próxima fase: FASE-(XX+1)
- Aguardando autorização do usuário para iniciar próxima fase.
```

---

## 2026-05-27 — SPEC criada

- Discovery concluído com 2 rodadas de perguntas (AskUserQuestion).
- Demanda classificada como: **COMPLEXA** — migração completa de subsistema de comunicação (wwebjs → Cloud API) com impacto em backend, banco de dados, webhook, frontend e integração externa (Meta).
- Docs base gerados: README.md, 00-VISAO-GERAL.md, 01-RESUMO.md, 02-RESEARCH.md.
- Plano de fases a ser aprovado na F2 (6 fases: FASE-00 a FASE-05); arquivos de fase ainda não criados.
- Commit base: `5ab59bb` (branch `main`).
- Decisões registradas no discovery:
  - App Meta por empresa (não único SaaS)
  - Token em texto puro (risco aceito explicitamente pelo usuário)
  - Tabela `WhatsappCloudConfig` dedicada (não Options)
  - Validação em ambiente dev (`/apidev/`) antes de prod
  - Webhook URL: `https://app.oregonservicos.com.br/apidev/webhook/whatsapp`
  - Fluxos/disparos/IA ficam como TODO (não crashar; usuário ciente)
  - Embedded Signup: fase futura
- Próxima ação: aguardando aprovação do plano de fases e comando `iniciar fase 00`.

---

## TESTES HUMANOS PENDENTES (acumulativo)

> Atualizado continuamente durante o autopilot. Quando o Janderson voltar, validar manualmente cada item.

### FASE-01 — chamadas HTTP reais à Graph API (cloudApiClient)
- [ ] Com credenciais Meta REAIS configuradas (`POST /whatsapp/config`), validar envio de texto via `messageService.sendTextMessage` para um número de teste dentro da janela de 24h e confirmar recebimento no WhatsApp.
- [ ] Validar `listTemplates` retornando os templates APPROVED da WABA real.
- [ ] Validar download de mídia inbound (depende da FASE-02) e upload de mídia outbound.
- Critério: mensagem chega no celular; erro 190/131047 retorna mensagem PT-BR amigável no chat.
- _Motivo do pendente:_ as funções HTTP exigem token Meta válido — não testáveis em modo simulação. A lógica local (isWindowOpen, persistência, idempotência, isolamento) já foi validada automaticamente.

---

## DECISÕES PENDENTES DE REVISÃO (acumulativo)

> Decisões tomadas com `[ASSUMPTION-AUTOPILOT]` que o Janderson pode querer ajustar.
> _(vazio até agora)_

---

## 2026-05-27 — AUTOPILOT START

- Modo: **autopilot** (usuário ausente, decisões tomadas pela sessão)
- Iniciado em: F2 (plano de fases) → F3 (geração dos `.md` de fase) → F4 (execução FASE-00)
- Gate config: PAUSE 90% / CAUTION 85% / bloqueio semanal duro 95%
- Gate no start: GO (5h 8% · semanal 16%)
- Plano de fases decidido sem checkpoint (F2 pulado por autopilot): 6 fases, ~18 subfases
- Estimativa de fases restantes: 6 (FASE-00 a FASE-05)

---

<!-- Adicione novas entradas abaixo, da mais antiga (topo) para a mais recente (fundo). -->

## 2026-05-27 20:25 — FASE-02 FECHADA (webhook fixo)

- Construção: builder agent (Sonnet 4.6 medium); correções pela sessão (Edit)
- Arquivos criados: `server/src/routes/webhook-route.js`
- Arquivos modificados: `server/src/index.js` (express.json verify→rawBody + mount /webhook), `configRepository.js` (getByVerifyToken), `messageRepository.js` (updateMediaPath), `conversationRepository.js` (incrementUnread)
- Testes (smoke de segurança INDEPENDENTE da sessão, http://127.0.0.1:3005):
  - Handshake válido → challenge ecoado; token errado → 403 ✅
  - **POST assinatura inválida → 401 e 0 linhas persistidas** ✅ (propriedade de segurança central)
  - POST assinatura válida → 200 + 1 linha; reenvio → idempotente (1 linha) ✅
  - Status update via webhook → status='read' ✅
  - Login + express.json intactos (rawBody não quebrou) ✅
  - Após fix: 2 entregas do mesmo wamid → unread_count=1 ✅
- 🔒 Security: ✅ — HMAC-SHA256 com crypto.timingSafeEqual (try/catch) validada ANTES de processar; empresa_id resolvido por phone_number_id (atacante não forja assinatura sem app_secret); sem PII em log; query de CLIENTES parametrizada; mídia em setImmediate (não bloqueia 200)
- ✅ Quality: ⚠️→✅ — corrigida inflação de unread_count em reentregas do Meta (incrementUnread movido para depois do check de idempotência)
- Validação final: critério de aceite da fase ✅; PM2 online
- 🌳 Commit: _(hash abaixo)_
- Próxima fase: FASE-03 (rotas REST do chat sobre Conversations/Messages)
- Autopilot: seguindo para FASE-03.

## 2026-05-27 20:10 — FASE-01 FECHADA (subfases A, B, C)

- Construção: builder agent (Sonnet 4.6 medium); correções pela sessão (Edit)
- Arquivos criados: `server/src/whatsapp/cloudApiClient.js`, `server/src/whatsapp/repositories/conversationRepository.js`, `server/src/whatsapp/repositories/messageRepository.js`, `server/src/whatsapp/messageService.js`
- Arquivos modificados: `server/package.json` (form-data como dep explícita)
- Testes:
  - Carregamento dos 4 módulos → OK; `isWindowOpen` 2h→true, 25h→false, null→false ✅
  - Integração no banco (empresa 1): upsert id estável, `unread_count` incrementa no inbound, `insertMessage` idempotente por wamid, `updateMessageStatusByWamid`, **isolamento cross-tenant** (getByWamid empresa errada → null), `getMessages` ✅ — linhas de teste limpas
- 🔒 Security: ✅ — token nunca logado; queries parametrizadas; isolamento por empresa_id em todo WHERE; anti-path-traversal no download (empresaId int + filename uuid); whitelist de extensão de mídia; timeout em todas as chamadas axios
- ✅ Quality: ⚠️→✅ — 3 correções da sessão:
  1. **Bug de runtime no `upsertConversation`**: array de params tinha 9 itens para 10 placeholders (faltava `unread_count` na posição do VALUES) → ER_PARSE_ERROR. Corrigido e re-testado.
  2. **`comRetry` (cloudApiClient)**: axios lança em 4xx/5xx, então o `mapearErroMeta` PT-BR nunca era aplicado — chamador recebia erro cru. Agora lança erro mapeado com `metaCode`.
  3. **`sendMediaMessage`**: passou a aceitar `mediaPath` e persistir `media_path` (spec previa; necessário pro chat exibir mídia enviada).
- Validação final: critério de aceite da fase ✅ (módulos + isWindowOpen + integração DB); PM2 `online` sem erros
- Testes humanos pendentes: chamadas HTTP reais ao Meta (ver seção no topo)
- 🌳 Commit: `def04e2` — feat(whatsapp): FASE-01 — cliente Cloud API + persistência de mensagens
- Próxima fase: FASE-02 (webhook fixo)
- Autopilot: seguindo para FASE-02.

## 2026-05-27 — DESCOBERTA OPERACIONAL

- **PM2 dev (`oregon-node-dev`, id 4) está com `watch=False`** — contradiz a memória do projeto. Após cada alteração de código no backend é preciso `pm2 restart oregon-node-dev` manualmente. Aplicável a todas as fases.
- **Porta 3005 fala HTTP puro** (não HTTPS). Para smoke local usar `http://127.0.0.1:3005`. A URL pública HTTPS é via Apache `/apidev/` (porta 443).
- **Login retorna o token em `response.accessToken`** (não no topo do JSON). empresa_id de teste = 1 (Janderson A23, user id 60).

## 2026-05-27 20:00 — FASE-00 subfase A — Migração de banco (DDL)

- Construção: builder agent (Sonnet 4.6 medium)
- Arquivos: `server/src/whatsapp/migrations/001_create_whatsapp_cloud_tables.sql` (+ aplicado no banco DEV)
- Testes: `SHOW TABLES` / `DESCRIBE` → WhatsappCloudConfig (phone_number_id=UNI), Conversations (uq empresa+contact), Messages (wamid=UNI, id BIGINT) ✅
- 🔒 Security: ✅ — colunas nullable, UNIQUE em phone_number_id (evita conflito de roteamento) e em wamid (idempotência)
- ✅ Quality: ✅
- Resultado: ✅ ok

## 2026-05-27 20:00 — FASE-00 subfase B — configRepository.js

- Construção: builder agent (Sonnet 4.6 medium)
- Arquivos: `server/src/whatsapp/repositories/configRepository.js`
- Testes: validado indiretamente pelo smoke da subfase C
- 🔒 Security: ✅ — queries parametrizadas, sem log de segredos, write-only nos tokens (só atualiza access_token/app_secret/verify_token se não-vazios), soft delete
- ✅ Quality: ✅ — getByEmpresa (linha mais recente), getByPhoneNumberId (só ativo=1, lookup do webhook)
- Resultado: ✅ ok

## 2026-05-27 20:00 — FASE-00 subfase C — configService + rota REST

- Construção: builder agent (Sonnet 4.6 medium); correção pela sessão (Edit) no tratamento de erro 500
- Arquivos: `server/src/whatsapp/configService.js`, `server/src/routes/whatsapp-config-route.js`, `server/src/index.js` (mount `/whatsapp` após `/zap`)
- Testes (smoke via curl, http://127.0.0.1:3005):
  - GET sem token → 401 ✅
  - POST sem phone_number_id → 400 ✅
  - POST válido → `{success:true}` ✅
  - graph_api_version `23; DROP` → 400 ✅ (anti-injeção de path)
  - Edição sem reenviar token → token preservado no banco ✅ (write-only)
  - GET → metadados + `has_*` + `webhook_url`, **sem secrets** ✅
  - DELETE → soft delete `ativo=0` ✅
- 🔒 Security: ⚠️→✅ — corrigido: POST não vaza mais `err.message` em 500 (só mensagem genérica); validação de input; isolamento por empresa_id do JWT
- ✅ Quality: ✅
- Validação final: todos os critérios de aceite da fase ✅
- Notas: webhook_url = `https://app.oregonservicos.com.br/apidev/webhook/whatsapp` (env `WHATSAPP_WEBHOOK_URL` com fallback)
- Resultado: ✅ ok

## 2026-05-27 20:00 — FASE-00 FECHADA

- Subfases concluídas: A, B, C
- Critério de aceite da fase: ✅ (tabelas + CRUD sem expor tokens + PM2 online)
- 🔒 Security review (consolidado): ✅ aprovado
- ✅ Quality review (consolidado): ✅ aprovado
- 🌳 Commit: `827e090` — feat(whatsapp): FASE-00 — modelo de dados + config Meta por empresa (branch `feat/whatsapp-cloud-api-chat`)
- Próxima fase: FASE-01 (cliente Cloud API + repositórios de mensagens)
- Autopilot: seguindo direto para FASE-01 (sem aguardar usuário).
