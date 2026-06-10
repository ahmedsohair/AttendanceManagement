import { useCallback, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import * as SecureStore from "expo-secure-store";
import type { MarkAttendanceRequest } from "@algo-attendance/shared";
import { markAttendance } from "../api/client";

const queueKey = "algo-attendance-offline-queue";

interface QueuedMark {
  id: string;
  payload: MarkAttendanceRequest;
  queuedAt: string;
}

export function useOfflineQueue() {
  const [queuedCount, setQueuedCount] = useState(0);

  const loadQueue = useCallback(async () => {
    const raw = await SecureStore.getItemAsync(queueKey);
    const queue = raw ? (JSON.parse(raw) as QueuedMark[]) : [];
    setQueuedCount(queue.length);
    return queue;
  }, []);

  const persistQueue = useCallback(async (queue: QueuedMark[]) => {
    await SecureStore.setItemAsync(queueKey, JSON.stringify(queue), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
    setQueuedCount(queue.length);
  }, []);

  const enqueue = useCallback(
    async (payload: MarkAttendanceRequest) => {
      const queue = await loadQueue();
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload,
        queuedAt: new Date().toISOString()
      });
      await persistQueue(queue);
    },
    [loadQueue, persistQueue]
  );

  const flush = useCallback(async () => {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      return;
    }

    const queue = await loadQueue();
    if (!queue.length) {
      return;
    }

    const remaining: QueuedMark[] = [];
    for (const item of queue) {
      try {
        await markAttendance(item.payload);
      } catch {
        remaining.push(item);
      }
    }

    await persistQueue(remaining);
  }, [loadQueue, persistQueue]);

  useEffect(() => {
    loadQueue().catch(() => undefined);
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        flush().catch(() => undefined);
      }
    });
    return unsubscribe;
  }, [flush, loadQueue]);

  return { queuedCount, enqueue, flush };
}
