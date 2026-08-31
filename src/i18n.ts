export type MessageSubstitutions = string | string[];

export function t(
  key: string,
  substitutions?: MessageSubstitutions,
  fallback?: string,
) {
  try {
    const message = chrome?.i18n?.getMessage?.(key, substitutions);
    return message || fallback || key;
  } catch {
    return fallback || key;
  }
}

export function formatMessage(
  key: string,
  substitutions: MessageSubstitutions,
  fallback: string,
) {
  return t(key, substitutions, fallback);
}
