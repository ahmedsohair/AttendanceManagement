import { useEffect, useState } from "react";
import { readRoomLive } from "../api/client";

export function useLiveRoomState(roomId?: string) {
  const [data, setData] = useState<Awaited<ReturnType<typeof readRoomLive>> | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const currentRoomId = roomId;
    let cancelled = false;

    async function refresh() {
      try {
        const result = await readRoomLive(currentRoomId);
        if (!cancelled) {
          setData(result);
          setError("");
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(
            refreshError instanceof Error ? refreshError.message : "Unable to refresh room."
          );
        }
      }
    }

    refresh().catch(() => undefined);
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId]);

  return { data, error };
}
