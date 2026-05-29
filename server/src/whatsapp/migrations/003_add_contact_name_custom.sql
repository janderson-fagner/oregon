-- Migração 003 — Nome de contato editável manualmente
-- O webhook atualiza Conversations.contact_name com o `profile.name` do Meta a
-- cada inbound (COALESCE), então um nome editado ali seria sobrescrito. Guardamos
-- o nome manual numa coluna separada que tem PRECEDÊNCIA na exibição e nunca é
-- tocada pelo webhook. NULLABLE (padrão do projeto).
-- MySQL 8 não suporta ADD COLUMN IF NOT EXISTS — rode apenas uma vez.

ALTER TABLE Conversations
  ADD COLUMN contact_name_custom VARCHAR(255) NULL;
