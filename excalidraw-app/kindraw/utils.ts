export const getErrorMessage = (
  error: unknown,
  fallback = "Ocorreu um erro inesperado.",
) => (error instanceof Error ? error.message : fallback);

export const isDraftNewer = (draftUpdatedAt: string, remoteUpdatedAt: string) =>
  new Date(draftUpdatedAt).getTime() > new Date(remoteUpdatedAt).getTime();
