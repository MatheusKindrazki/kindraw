-- Modo de acesso de um link público de compartilhamento.
-- 'read'      → leitura pública (comportamento atual; default p/ links existentes)
-- 'live-edit' → quem abrir o link entra na sessão de colaboração ao vivo do
--               híbrido e pode editar (doc + canvas), mesmo sem conta.
ALTER TABLE share_links ADD COLUMN access TEXT NOT NULL DEFAULT 'read';
