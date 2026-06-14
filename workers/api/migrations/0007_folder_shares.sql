-- Compartilhamento de pastas com usuários específicos (convite por @login).
-- Cada linha = uma pessoa com acesso a uma pasta, com um papel.
-- role: 'viewer' (só lê os itens) | 'editor' (cria/edita/move itens na pasta).
-- O dono da pasta nunca aparece aqui (ele tem acesso via folders.owner_id).
CREATE TABLE IF NOT EXISTS folder_shares (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  user_id TEXT NOT NULL,             -- quem recebeu acesso
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  granted_by_user_id TEXT NOT NULL,  -- dono que concedeu
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (folder_id, user_id)
);

CREATE INDEX IF NOT EXISTS folder_shares_folder_id_idx ON folder_shares(folder_id);
CREATE INDEX IF NOT EXISTS folder_shares_user_id_idx ON folder_shares(user_id);
