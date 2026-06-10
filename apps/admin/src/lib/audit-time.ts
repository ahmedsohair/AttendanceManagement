export function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Australia/Sydney"
  }).format(new Date(value));
}
