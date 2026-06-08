-- 005_add_location_column.sql
-- Adiciona coluna para armazenar mensagens de localização (type=location).
-- Guarda o objeto bruto enviado pela Meta: { latitude, longitude, name?, address? }.
-- NULLABLE para manter retrocompatibilidade com mensagens já existentes.
ALTER TABLE Messages ADD COLUMN location JSON NULL AFTER contacts;
