# 01 — Resumo Executivo

> **TL;DR:** Trocamos o whatsapp-web.js (instável, não-oficial, risco de ban) pela WhatsApp Cloud API oficial do Meta — mantendo o chat de atendimento funcionando, com persistência própria de mensagens e suporte à janela de 24 horas.

---

## Por quê

O módulo atual de chat depende do `whatsapp-web.js`, uma biblioteca não-oficial que emula o WhatsApp Web via Chrome/Puppeteer. Isso gera uma cadeia de problemas: o QR code precisa ser re-escaneado periodicamente, o processo Chrome consome memória significativa, a sessão pode cair a qualquer momento sem aviso e — mais importante — o Meta pode banir o número a qualquer momento por uso de automação não-autorizada.

A WhatsApp Cloud API é a solução oficial e gratuita do Meta para o mesmo problema. Ela funciona via webhook HTTP simples, sem sessão local, sem Chrome, sem QR code. O histórico de mensagens precisa ser persistido pelo próprio sistema (o Meta não entrega histórico), o que na verdade é uma vantagem: o chat passa a funcionar mesmo quando o servidor reinicia, algo impossível hoje.

A decisão de fazer a migração agora (e não depois) é motivada pelo custo crescente de manutenção do wwebjs e pelo risco real de perda total do canal de comunicação por ban. A Cloud API também abre caminho para recursos futuros que o wwebjs não suporta de forma confiável, como templates de mensagem aprovados pelo Meta.

---

## O que muda

- **Conexão WhatsApp**: de sessão local wwebjs + QR code para webhook HTTP Cloud API (sem Chrome, sem Puppeteer, sem QR)
- **Arquitetura de clients**: de 2 clients por empresa (`atendimento_X` / `disparos_X`) para 1 canal único por empresa via `WhatsappCloudConfig`
- **Persistência**: de leitura ao vivo (`client.getChats()` / `chat.fetchMessages()`) para banco de dados próprio — tabelas `Conversations` e `Messages`
- **Credenciais**: nova tabela `WhatsappCloudConfig` por empresa (Phone Number ID, WABA ID, Access Token, App Secret, Verify Token)
- **Webhook**: novo endpoint fixo `GET + POST /webhook/whatsapp` com validação HMAC-SHA256 via raw body
- **UX do atendimento**: janela de 24 horas explícita na UI; fora da janela, envio de template aprovado; dentro da janela, texto livre normal
- **Templates**: listagem de templates aprovados (`APPROVED`) e envio via Cloud API
- **Frontend — configuração**: formulário de credenciais Meta substitui a tela de QR code
- **Frontend — chat**: lista e histórico lidos de `Conversations`/`Messages` (banco) em vez de ao vivo do wwebjs
- **Status de entrega**: sent/delivered/read/failed vindos do webhook Meta, refletidos via socket.io na UI
- **Mídia inbound**: download em 2 passos (GET media-id → URL; download com Bearer token) e salvo em `/uploads/midias/`

## O que NÃO muda

- **Estrutura multi-tenant** — `empresa_id` continua sendo injetado via JWT em todas as rotas autenticadas
- **Socket.io** — `emitToEmpresa`, evento `nova-mensagem` e `update-mensagem` são reaproveitados sem modificação
- **Pasta de mídia** — `/uploads/midias/` continua sendo o destino de arquivos recebidos
- **Rotas autenticadas** — todas as rotas do chat continuam exigindo JWT (exceto o webhook, que é validado por HMAC-SHA256)
- **Modelo de dados de clientes** — tabela `CLIENTES` (CRM) continua sendo referenciada e atualizada com `cli_ultima_msg_*`
- **Interface geral do chat** — layout, componentes Vue/Vuetify, gravador de áudio, reply — apenas ajustes pontuais
- **PM2 / infraestrutura** — processo `oregon-node-dev` (ID 4, dev) e `node-oregon` (ID 0, prod) sem mudança
- **Ambiente de validação** — desenvolvimento em `/apidev/` (porta 3005) antes de ir para prod

---

## Principais riscos

| Risco | Mitigação |
|-------|-----------|
| Empresa sem credenciais Meta = chat indisponível após rollout | FASE-04 (formulário) é entregue antes da FASE-05 (remoção wwebjs); migração fase a fase |
| Token Meta em texto puro no banco | Campo write-only no frontend; nunca devolver token em GET; risco aceito explicitamente pelo usuário |
| Raw body necessário para HMAC-SHA256 conflita com `express.json()` global | `express.json({ verify: saveRawBody })` configurado antes de qualquer middleware; isolado e testado |
| Fluxos/IA/disparos param de funcionar após remoção do wwebjs | Stubs com `TODO` claros; aplicação não crasha; usuário ciente e aceitou |
| Token de acesso Meta pode expirar (token de usuário curta duração) | Documentar uso obrigatório de System User Token permanente; aviso no formulário de credenciais |
| Versão Graph API depreciada no futuro | `GRAPH_API_VERSION` configurável via variável de ambiente; sem hardcode |

---

## Ordem de execução

| # | Fase | Objetivo |
|---|------|----------|
| 0 | FASE-00 | Modelo de dados + camada de configuração Meta (migrations, CRUD de credenciais por empresa) |
| 1 | FASE-01 | Módulo cliente Cloud API (enviar texto/mídia/template, marcar lido, baixar/upload mídia, listar templates) |
| 2 | FASE-02 | Webhook fixo (GET handshake + POST HMAC-SHA256, roteamento por `phone_number_id`, persistência, socket) |
| 3 | FASE-03 | Rotas REST do chat reescritas sobre `Conversations`/`Messages` (allChats, getChat, send, status, janela 24h) |
| 4 | FASE-04 | Frontend: formulário de credenciais Meta + ajustes de chat (janela 24h, templates, status de entrega) |
| 5 | FASE-05 | Remoção do wwebjs + stubs TODO (remover lib/sessão/listeners; garantir que a aplicação não crasha) |

> **Importante:** as FASE-00 a FASE-04 são aditivas (não removem nada do wwebjs). Apenas a FASE-05 remove o código legado. Isso permite rollback até a FASE-05.

---

## Critério de aceite global

A SPEC fecha como ✅ apenas quando:

1. Todas as 6 fases (FASE-00 a FASE-05) estão ✅ no log de execução.
2. Mensagem enviada pelo cliente chega ao chat do atendente em ≤ 3 s via webhook → socket.io → UI.
3. Mensagem enviada pelo atendente é entregue ao cliente via Cloud API com `wamid` persistido e status `delivered` refletido na UI.
4. Nenhum processo Chrome/Puppeteer em execução; PM2 sem erros de sessão wwebjs.
5. Security review das FASE-01, FASE-02, FASE-03 e FASE-04 aprovados sem achados críticos ou altos em aberto.
