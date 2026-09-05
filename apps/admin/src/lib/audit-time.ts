export function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Australia/Sydney"
  }).format(new Date(value));
}

export function formatScannerDuplicateTime(value: string) {
  if (!value?.trim() || !Number.isFinite(new Date(value).getTime())) {
    return "Time unavailable";
  }
  return `${formatAuditTime(value)} (Australia/Sydney)`;
}
