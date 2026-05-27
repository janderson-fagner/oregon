# WhatsApp Cloud API — Chat/Atendimento — SPEC

Migração completa do módulo de Chat/Atendimento do `whatsapp-web.js` (wwebjs) para a **WhatsApp Cloud API oficial do Meta** (Graph API). O wwebjs apresenta instabilidade crescente (QR code, Chrome/Puppeteer, risco de ban pelo Meta); a Cloud API resolve esses problemas com uma integração oficial, estável e sem sessão local. O resultado esperado é um módulo de chat funcional, multi-tenant, com persistência própria de mensagens e UX de janela de 24 horas.

## Índice

| Documento | Descrição |
|-----------|-----------|
| [00-VISAO-GERAL.md](./00-VISAO-GERAL.md) | Objetivo, escopo, estado atual vs. desejado, riscos macro |
| [01-RESUMO.md](./01-RESUMO.md) | TL;DR — o que vai mudar e por quê |
| [02-RESEARCH.md](./02-RESEARCH.md) | Pesquisa técnica, decisões de arquitetura, referências |
| [10-LOG-EXECUCAO.md](./10-LOG-EXECUCAO.md) | Log vivo de execução (datas, commits, validações, blockers) |

### Fases detalhadas

Pasta `fases/` — uma fase por arquivo `.md`. Cada fase tem subfases (A, B, C, …) executáveis individualmente por agent Sonnet 4.6 (medium effort), com validação e review pelo modelo da sessão.

> **As fases serão criadas na etapa F3 (aprovação do plano).** Os arquivos abaixo ainda não existem — são apenas o plano proposto.

- `fases/FASE-00-modelo-dados-config.md` — Modelo de dados + camada de configuração Meta (tabelas `WhatsappCloudConfig`, `Conversations`, `Messages`; CRUD de credenciais por empresa)
- `fases/FASE-01-cliente-cloud-api.md` — Módulo cliente Cloud API (enviar texto/mídia/template, marcar lido, baixar/upload mídia, listar templates aprovados)
- `fases/FASE-02-webhook.md` — Webhook fixo (GET handshake + POST com validação HMAC-SHA256 raw body, roteamento por `phone_number_id`, persistência, emissão socket)
- `fases/FASE-03-rotas-rest-chat.md` — Rotas REST do chat reescritas sobre `Conversations`/`Messages` (allChats, getChat, send, status, janela 24h, templates GET)
- `fases/FASE-04-frontend.md` — Frontend: formulário de credenciais Meta (substitui QR) + ajustes do chat (janela 24h, seleção de template, indicadores de status)
- `fases/FASE-05-remocao-wwebjs.md` — Remoção do wwebjs + stubs TODO (remover lib/sessão/listeners; deixar fluxos/crons/disparos como TODO sem crashar a aplicação)

## Princípios

1. **Segurança em primeiro lugar** — toda subfase passa por security review obrigatório antes de fechar.
2. **PT-BR com acentuação correta** em strings de UI, respostas de API e docs.
3. **Sem refatoração gratuita** — cada fase mexe só no necessário.
4. **Validação dupla quando aplicável** — teste via API + verificação no frontend.
5. **Subagent (Sonnet 4.6 medium) constrói; modelo da sessão valida.**

## Estado base (commit pré-execução)

- `5ab59bb` (`main`) — feat(relatorios-servicos): matriz pivotada Serviço × Origem com filtros

## Stakeholders

- **Janderson (jandersonfagner@gmail.com)** — product owner, tomador de todas as decisões de produto e arquitetura
- **Agents Sonnet 4.6** — execução das subfases
- **Modelo da sessão** — discovery, planejamento, validação, security review e quality review

## Como executar

1. Ler `00-VISAO-GERAL.md` e `01-RESUMO.md` para contexto completo.
2. Aguardar aprovação do plano de fases (etapa F2 do workflow spec-a23).
3. Iniciar pela `FASE-00`. Cada fase só pode começar quando a anterior estiver ✅ no log.
4. Comando: `iniciar fase 00` (ou número da fase desejada).
5. Após cada fase, atualizar `10-LOG-EXECUCAO.md` e aguardar autorização do usuário para seguir.

## Ambiente de validação

- **Dev:** `https://app.oregonservicos.com.br/apidev/` (PM2 ID 4 `oregon-node-dev`, porta 3005)
- **Webhook URL (dev):** `https://app.oregonservicos.com.br/apidev/webhook/whatsapp`
- **Prod:** `https://app.oregonservicos.com.br/api/` (PM2 ID 0 `node-oregon`, porta 3000)
