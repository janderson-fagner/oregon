-- Migração 002 — Rastreio de origem da conversa/mensagem (Click-to-WhatsApp Ads)
-- A Cloud API entrega, na PRIMEIRA mensagem inbound originada de um anúncio
-- "iniciar conversa no WhatsApp", o objeto `messages[].referral` (source_url,
-- source_id, source_type, headline, body, media_type, image_url/video_url,
-- thumbnail_url, ctwa_clid). Mensagens sobre produtos do catálogo trazem
-- `messages[].context.referred_product` (catalog_id, product_retailer_id).
--
-- Guardamos o objeto BRUTO em colunas JSON para não perder nenhum campo que a
-- Meta envie agora ou no futuro. Todas NULLABLE (padrão do projeto).
-- MySQL 8 não suporta ADD COLUMN IF NOT EXISTS — rode apenas uma vez.

-- Origem por MENSAGEM (onde o referral realmente chegou — histórico completo)
ALTER TABLE Messages
  ADD COLUMN referral         JSON NULL,
  ADD COLUMN referred_product JSON NULL;

-- Origem por CONVERSA (promove o referral para o nível da conversa: "esta
-- conversa veio do anúncio X"). Atualizado para o referral mais recente.
ALTER TABLE Conversations
  ADD COLUMN referral    JSON     NULL,
  ADD COLUMN referral_at DATETIME NULL;
