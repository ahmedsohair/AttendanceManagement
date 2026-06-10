export function getSafeNextPath(input: string | null | undefined, fallback = "/") {
  const value = input?.trim();
  if (!value) {
    return fallback;
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    /[\u0000-\u001f\\]/.test(value)
  ) {
    return fallback;
  }

  return value;
}
