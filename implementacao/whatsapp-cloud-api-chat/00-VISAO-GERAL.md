# 00 — Visão Geral

## Objetivo

Substituir o módulo de Chat/Atendimento baseado em `whatsapp-web.js` (wwebjs) pela **WhatsApp Cloud API oficial do Meta** (Graph API v23.0 configurável). A migração elimina a dependência de sessão local com Chrome/Puppeteer, o fluxo de QR code, a dualidade de clients por empresa (`atendimento_X` / `disparos_X`) e o risco de ban por uso de API não-oficial. O produto entregue é um canal de chat estável, multi-tenant, com persistência própria de mensagens, webhook validado por assinatura HMAC-SHA256, UX de janela de 24 horas e envio de templates aprovados fora da janela.

---

## Escopo

### Dentro

- **`server/src/zap/`** — substituição completa do módulo wwebjs por um novo módulo Cloud API
- **`server/src/routes/zap-route.js`** — reescrita das rotas de chat sobre a nova camada de persistência (`Conversations` / `Messages`)
- **Webhook fixo** `GET /webhook/whatsapp` + `POST /webhook/whatsapp` — rota única sem autenticação JWT, validada por HMAC-SHA256 com raw body
- **Tabela `WhatsappCloudConfig`** — credenciais Meta por empresa (`phone_number_id`, `waba_id`, `access_token`, `app_secret`, `verify_token`), indexada por `phone_number_id`
- **Tabela `Conversations`** — conversas por empresa + número de telefone do cliente, com `last_inbound_at` para controle da janela 24h
- **Tabela `Messages`** — mensagens persistidas (direção inbound/outbound, status, `wamid`, tipo de mídia, timestamps)
- **Configuração de credenciais Meta por empresa** — formulário no frontend (write-only para o token), substituindo a tela de QR code
- **Envio de mensagens** — texto, imagem, documento, áudio, reply (via `context.message_id`), marcar como lida
- **Mídia inbound** — download via media-id (2 passos: GET URL + download Bearer), salvo em `/uploads/midias/`
- **Mídia outbound** — upload via `/{phone_number_id}/media` ou link direto
- **Janela de 24h** — UI bloqueia texto livre fora da janela e oferece envio de template aprovado; `last_inbound_at` persistido por conversa
- **Templates** — somente listar (GET `/{waba_id}/message_templates`, filtrar `APPROVED`) e enviar template existente
- **Status de entrega** — webhook `statuses[]` (sent/delivered/read/failed) refletidos na UI via socket.io
- **Frontend `client/src/pages/apps/crm/chat.vue`** — ajustes para ler de `Conversations`/`Messages`, UX de janela 24h, seleção de template, indicadores de status

### Fora (TODO — podem parar de funcionar temporariamente; aplicação NÃO pode crashar)

- **Fluxos de atendimento / automação (Gemini)** — depende do wwebjs para envio; ficará como stub TODO
- **Disparos em massa** — depende do client `disparos_X`; ficará como stub TODO
- **Crons de lembrete de agendamento** — envios agendados; ficará como stub TODO
- **Relatórios que dependem de dados wwebjs** — não impactado diretamente, mas sem novas mensagens wwebjs
- **Gestão de templates** (criar / editar / submeter para aprovação Meta) — fora do escopo; apenas listar e enviar
- **Embedded Signup** (onboarding OAuth automático Meta) — fase futura; agora é configuração manual de credenciais
- **Indicador de "digitando" do cliente** — Cloud API não entrega presença/typing do cliente (apenas permite ENVIAR typing indicator)
- **Presença / online do cliente** — não disponível na Cloud API

---

## Estado atual (2026-05-27)

| Item | Status | Observação |
|------|--------|------------|
| Conexão WhatsApp | ⚠️ instável | wwebjs com QR code, Chrome/Puppeteer, risco de ban |
| Sessão por empresa | ⚠️ dualidade | 2 clients por empresa: `atendimento_X` e `disparos_X` |
| Persistência de mensagens | ❌ inexistente | Chat lê ao vivo via `client.getChats()` / `chat.fetchMessages()`; sem tabela de mensagens |
| Histórico offline | ❌ inexistente | Sem conexão wwebjs = sem histórico |
| Webhook oficial Meta | ❌ inexistente | Não há integração com Cloud API |
| Validação de assinatura | ❌ inexistente | Sem HMAC-SHA256 |
| Janela de 24h | ❌ não gerenciada | wwebjs não impõe essa restrição |
| Templates Meta | ❌ não integrado | Sem listagem ou envio de templates |
| Credenciais Meta por empresa | ❌ inexistente | Sem tabela/config dedicada |
| Status de entrega (sent/delivered/read) | ⚠️ parcial | `message_ack` do wwebjs, não persiste |
| Multi-tenant (empresa_id) | ✅ ok | JWT injeta `empresa_id` em todas as rotas autenticadas |
| Socket.io (`emitToEmpresa` / `nova-mensagem`) | ✅ ok | Funcionando; será reaproveitado |
| Pasta `/uploads/midias/` | ✅ ok | Já utilizada para mídia; será mantida |

## Estado desejado

| Item | Critério de verificação |
|------|-------------------------|
| Conexão estável sem QR | Nenhum processo Chrome/Puppeteer em execução; PM2 sem erros de sessão |
| Canal único por empresa | Apenas 1 registro em `WhatsappCloudConfig` por empresa; sem tabela `Clients` wwebjs em uso |
| Persistência de mensagens | Mensagem recebida via webhook aparece em `Messages` com `wamid` correto; recuperável após restart do PM2 |
| Webhook GET handshake | `curl GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=abc` retorna `abc` em texto puro |
| Webhook POST assinatura válida | Payload com assinatura correta → 200; assinatura inválida → 403 |
| Roteamento multi-tenant pelo `phone_number_id` | Mensagem de empresa A não aparece no chat da empresa B |
| Envio de texto | `POST /zap/send-message-chat` envia via Cloud API e persiste em `Messages` com status `sent` |
| Envio de mídia (imagem/doc/áudio) | Arquivo salvo em `/uploads/midias/` e entregue via Cloud API |
| Status de entrega refletido na UI | Ícone de check/lido atualiza em tempo real via socket `update-mensagem` |
| Janela 24h — bloqueio | Tentativa de texto livre fora da janela retorna erro claro na UI |
| Janela 24h — template | Envio de template aprovado funciona fora da janela |
| Listagem de templates | `GET /zap/templates` retorna apenas templates com `status=APPROVED` |
| Formulário de credenciais | Admin salva Phone Number ID + WABA ID + token; token não é devolvido em leitura subsequente (mascarado) |
| Fluxos/disparos não crasham | PM2 não gera uncaught exception ao remover wwebjs; endpoints retornam 503 com mensagem `TODO` |
| Security review aprovado | Zero achados críticos/altos abertos nas fases com impacto de segurança (01, 02, 03, 04) |

---

## Stakeholders

- **Janderson (jandersonfagner@gmail.com)** — product owner; tomou todas as decisões de escopo, arquitetura e trade-offs desta SPEC
- **Agents Sonnet 4.6** — execução fase a fase
- **Modelo da sessão** — orquestração, validação, security review e quality review

---

## Riscos macro

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Empresa sem credenciais Meta configuradas = chat totalmente indisponível após rollout | Alto | Alta (todas as empresas precisam configurar) | Comunicar antecipadamente; FASE-04 entrega o formulário antes da FASE-05 remover wwebjs; manter wwebjs até FASE-05 aprovada |
| Token de acesso Meta em texto puro no banco — vazamento de banco = vazamento de credenciais | Alto | Baixa (banco não exposto diretamente) | Campo write-only no frontend; nunca devolver token em GET; documentar risco explicitamente; mitigação real via criptografia em repouso é decisão futura |
| Raw body obrigatório para validação HMAC-SHA256 — conflito com `express.json()` global | Alto | Média | Configurar `express.json({ verify: (req,res,buf) => req.rawBody=buf })` antes de qualquer middleware JSON; testar isoladamente |
| Fluxos de atendimento / IA param de funcionar após FASE-05 | Médio | Alta (depende do wwebjs) | Stubs claros (`TODO: migrar para Cloud API`); não remover wwebjs antes de FASE-05 aprovada; usuário ciente |
| Janela de 24h muda o UX de forma significativa — atendentes não habituados | Médio | Média | UX explícita na tela: indicador visual da janela + botão de template; documentar na FASE-04 |
| Token de acesso Meta pode expirar (token de usuário tem vida curta) | Alto | Média | Documentar uso obrigatório de System User Token permanente na FASE-00; avisar no formulário de credenciais |
| `phone_number_id` duplicado em duas empresas (erro de configuração) | Médio | Baixa | Constraint `UNIQUE` na tabela `WhatsappCloudConfig` por `phone_number_id`; erro claro no CRUD |
| Rate limit Meta (80 mensagens/s por número; tiers de conversa) | Médio | Baixa (baixo volume atual) | Implementar retry com backoff para erros 131056 e 80007; logar erros de rate limit |
| Versão Graph API depreciada (atualmente v23.0) | Baixo | Baixa (Meta mantém versões por ~2 anos) | `GRAPH_API_VERSION` configurável via variável de ambiente; upgrade em config sem código |

---

## Premissas e suposições

- [ASSUMPTION: cada empresa tem seu próprio App Meta com App Secret e Verify Token distintos] — Impacto: ALTO · Corrigir se: o usuário quiser um único App Meta SaaS compartilhado entre todas as empresas (requer Embedded Signup e configuração diferente)
- [ASSUMPTION: o access_token utilizado será um System User Token de longa duração (não expira), conforme recomendação Meta] — Impacto: ALTO · Corrigir se: for usado token de usuário de curta duração; nesse caso é necessário fluxo de refresh
- [ASSUMPTION: o volume atual de mensagens por empresa está dentro do tier padrão Meta (até 1.000 conversas únicas business-initiated por dia)] — Impacto: MÉDIO · Corrigir se: volume for maior; pode exigir aprovação de tier superior na Meta Business Suite
- [ASSUMPTION: a pasta `/uploads/midias/` tem espaço e permissões adequados para armazenar mídias recebidas via Cloud API] — Impacto: MÉDIO · Corrigir se: espaço em disco for limitado; considerar S3/CDN
- [ASSUMPTION: as empresas configurarão as credenciais Meta manualmente antes de usar o chat; não há migração automática de histórico do wwebjs] — Impacto: ALTO · Corrigir se: for necessário preservar histórico de conversas pré-migração
- [ASSUMPTION: o número de telefone Meta já está verificado e aprovado pelo Meta para uso na Cloud API antes da FASE-01] — Impacto: ALTO · Corrigir se: o número ainda precisar de aprovação (processo leva dias/semanas)
- [ASSUMPTION: `server/src/socket.js` exporta `emitToEmpresa` de forma reutilizável sem modificação] — Impacto: BAIXO · Corrigir se: a função não for acessível fora do contexto do socket server atual
- [ASSUMPTION: o token em texto puro é aceito como risco pelo usuário — confirmado explicitamente durante o discovery] — Impacto: ALTO · Registrado como decisão consciente; mitigação mínima: campo write-only no frontend

---

## Não-objetivos

- NÃO implementar Embedded Signup (onboarding OAuth automático Meta) — configuração manual de credenciais é suficiente nesta SPEC
- NÃO criar, editar ou submeter templates para aprovação Meta — apenas listar `APPROVED` e enviar
- NÃO migrar ou preservar histórico de mensagens do wwebjs — nova persistência começa do zero
- NÃO implementar criptografia do access_token em repouso no banco — registrado como risco aceito
- NÃO migrar fluxos de atendimento, automação Gemini, disparos em massa ou crons de lembrete para Cloud API — ficam como TODO
- NÃO implementar typing indicator do cliente (Cloud API não disponibiliza) nem presença/online
- NÃO alterar a estrutura multi-tenant (empresa_id via JWT) — mantida como está
- NÃO implementar webhook separado por empresa — um único endpoint `/webhook/whatsapp` roteia por `phone_number_id`

---

## Métricas de sucesso

- **Zero erros de sessão wwebjs** no log do PM2 após FASE-05 — alvo: 0 ocorrências
- **100% das mensagens recebidas via webhook** persistidas em `Messages` com `wamid` único — alvo: sem gaps de mensagens
- **Validação HMAC-SHA256** — alvo: 100% das requisições com assinatura inválida rejeitadas com HTTP 403
- **Janela 24h** — alvo: tentativa de texto livre fora da janela retorna erro na UI em 100% dos casos
- **Tempo de envio de mensagem (texto)** — alvo: ≤ 3 s de ponta a ponta (API Node → Cloud API → webhook de status → UI)
- **Security review** das FASE-01, FASE-02, FASE-03 e FASE-04 — alvo: zero achados críticos ou altos sem mitigação documentada
