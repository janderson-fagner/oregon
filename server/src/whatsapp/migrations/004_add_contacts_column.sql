-- Migration 004: coluna `contacts` na tabela Messages
-- ----------------------------------------------------------------------------
-- Mensagens do tipo `contacts` (cartão de contato / vCard compartilhado) trazem
-- no webhook o array `messages[].contacts` (name, phones, emails, org, addresses).
-- Antes esse conteúdo era descartado e o balão ficava vazio no chat.
-- Guardamos o objeto BRUTO em coluna JSON para não perder nenhum campo e
-- renderizar um card de contato no frontend. NULLABLE para retrocompatibilidade.

ALTER TABLE Messages
  ADD COLUMN contacts JSON NULL;
