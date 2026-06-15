-- Compartilhamento de documentos híbridos com usuários específicos (convite por
-- @login do GitHub), espelhando folder_shares (0007). Cada linha = uma pessoa
-- com acesso a um híbrido, com um papel.
-- role: 'viewer' (só lê o doc+canvas) | 'editor' (edita o doc e o canvas, e entra
-- na sessão de colaboração ao vivo).
-- O dono do híbrido nunca aparece aqui (ele tem acesso via hybrid_items.owner_id).
CREATE TABLE IF NOT EXISTS hybrid_shares (
  id TEXT PRIMARY KEY,
  hybrid_id TEXT NOT NULL,
  user_id TEXT NOT NULL,             -- quem recebeu acesso
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  granted_by_user_id TEXT NOT NULL,  -- dono que concedeu
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (hybrid_id) REFERENCES hybrid_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (hybrid_id, user_id)
);

CREATE INDEX IF NOT EXISTS hybrid_shares_hybrid_id_idx ON hybrid_shares(hybrid_id);
CREATE INDEX IF NOT EXISTS hybrid_shares_user_id_idx ON hybrid_shares(user_id);
