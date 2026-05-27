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
> _(vazio até agora — itens serão acrescentados ao fim de cada subfase com validação humana)_

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
- 🌳 Commit: _(hash registrado abaixo após git)_
- Próxima fase: FASE-01 (cliente Cloud API + repositórios de mensagens)
- Autopilot: seguindo direto para FASE-01 (sem aguardar usuário).
