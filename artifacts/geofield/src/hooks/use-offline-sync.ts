import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSample, getGetSamplesQueryKey } from "@workspace/api-client-react";
import { getQueue, removeFromQueue, QUEUE_UPDATED_EVENT } from "@/lib/offline-queue";

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(() => getQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(() => {
    setQueueCount(getQueue().length);
  }, []);

  useEffect(() => {
    window.addEventListener(QUEUE_UPDATED_EVENT, refreshCount);
    window.addEventListener("storage", refreshCount);
    return () => {
      window.removeEventListener(QUEUE_UPDATED_EVENT, refreshCount);
      window.removeEventListener("storage", refreshCount);
    };
  }, [refreshCount]);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);
    setLastError(null);
    let synced = 0;

    for (const item of queue) {
      try {
        await createSample({ data: item.payload as any });
        removeFromQueue(item.queuedId);
        synced++;
      } catch (error: any) {
        setLastError(error?.message || "Could not sync. Make sure you are signed in, then try again.");
        break;
      }
    }

    if (synced > 0) {
      setSyncedCount(synced);
      queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
      setTimeout(() => setSyncedCount(0), 5000);
    }

    refreshCount();
    syncingRef.current = false;
    setIsSyncing(false);
  }, [queryClient, refreshCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync]);

  return { isOnline, queueCount, isSyncing, syncedCount, lastError, sync };
}
