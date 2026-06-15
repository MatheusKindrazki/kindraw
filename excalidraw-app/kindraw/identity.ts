// Identidade visual de participantes na colaboração ao vivo.
// Cor determinística por usuário (mesma pessoa = mesma cor sempre), de uma
// paleta curada de alto contraste que harmoniza com a identidade Ateliê
// (papel-creme + navy + âmbar). Usada de forma consistente em cursor + caret
// de texto + avatar do facepile + seleção, como nos benchmarks (Figma/Eraser).

// Paleta de 12 cores distintas e legíveis sobre fundo claro. Evita o âmbar da
// marca (para não confundir com acento) e tons quase idênticos entre si.
const PRESENCE_PALETTE = [
  "#2f6fed", // azul
  "#e8590c", // laranja
  "#2f9e44", // verde
  "#9c36b5", // roxo-magenta
  "#1098ad", // ciano
  "#e03131", // vermelho
  "#5c7cfa", // índigo claro
  "#f08c00", // âmbar-escuro (≠ acento da marca)
  "#0ca678", // teal
  "#d6336c", // rosa
  "#4263eb", // azul-royal
  "#74b816", // lima
];

// Hash estável (djb2-ish) de uma string → inteiro não-negativo.
const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

// Cor de presença estável para um usuário, a partir de uma seed (id, login...).
export const colorForUser = (seed: string): string =>
  PRESENCE_PALETTE[hashString(seed || "anon") % PRESENCE_PALETTE.length];

// Iniciais para o avatar de fallback (sem foto): primeira letra de até 2
// palavras do nome, maiúsculas.
export const initialsForName = (name: string): string => {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Handle de exibição de um usuário. Contas GitHub têm githubLogin; contas só
// com Google não — caem para a parte local do email e, por fim, para o nome.
// Use sempre isto em vez de ler user.githubLogin direto (que pode ser null).
export const userHandle = (user: {
  githubLogin: string | null;
  email?: string | null;
  name?: string;
}): string =>
  user.githubLogin || user.email?.split("@")[0] || user.name || "user";

// Subtítulo de exibição (linha secundária na lista de pessoas): "@login" para
// contas GitHub, o e-mail completo para contas só-Google. Evita mostrar
// "@parte-local-do-email", que confunde com um handle GitHub real.
export const userSubtitle = (user: {
  githubLogin: string | null;
  email?: string | null;
}): string => {
  if (user.githubLogin) {
    return `@${user.githubLogin}`;
  }
  return user.email || "";
};

// Identidade de um participante normalizada para a UI de presença.
export type PresenceUser = {
  // chave estável p/ dedupe (userId quando logado, senão o socket/cliente id)
  key: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  githubLogin: string | null;
  isSelf: boolean;
  idle: boolean;
};
