-- Convites de pasta/híbrido por link (para quem ainda não tem conta).
-- Cada linha = um convite com um token único e copiável (/invite/<token>).
-- O link É a credencial: qualquer conta logada que abra e clique "Aceitar"
-- ganha acesso. Token único, expira em 7 dias, uso único (aceite marca
-- accepted_*). NÃO há FK em resource_id — pode apontar para uma pasta OU para
-- um híbrido (resource_type discrimina), validado na camada de aplicação.
-- O aceite materializa uma linha real em folder_shares/hybrid_shares.
CREATE TABLE IF NOT EXISTS share_invites (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,                 -- random 32 bytes base64url (entropia alta)
  resource_type TEXT NOT NULL CHECK (resource_type IN ('folder', 'hybrid')),
  resource_id TEXT NOT NULL,           -- folder_id ou hybrid_id
  email TEXT,                          -- e-mail-alvo (normalizado lower; informativo)
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  invited_by_user_id TEXT NOT NULL,    -- dono que criou o convite
  accepted_by_user_id TEXT,            -- preenchido no aceite
  accepted_at TEXT,                    -- preenchido no aceite
  expires_at TEXT NOT NULL,            -- created_at + 7 dias
  created_at TEXT NOT NULL,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS share_invites_token_idx ON share_invites(token);
CREATE INDEX IF NOT EXISTS share_invites_resource_idx ON share_invites(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS share_invites_invited_by_idx ON share_invites(invited_by_user_id);
