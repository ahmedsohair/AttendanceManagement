export function normalizeStudentId(value: string) {
  const compact = value.trim().toUpperCase().replace(/\s+/g, "");
  const rmitMatch = compact.match(/^S(\d{4,})$/);
  return rmitMatch ? rmitMatch[1] : compact;
}
