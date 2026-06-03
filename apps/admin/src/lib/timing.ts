import "server-only";

type TimingFields = Record<string, string | number | boolean | null | undefined>;

export function logServerTiming(
  name: string,
  startedAt: number,
  fields: TimingFields = {}
) {
  const durationMs = Math.round(performance.now() - startedAt);
  console.info(
    `[perf] ${JSON.stringify({
      name,
      durationMs,
      ...fields
    })}`
  );
}
