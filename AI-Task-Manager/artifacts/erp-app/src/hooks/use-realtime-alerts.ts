import { useEffect, useRef, useCallback } from "react";

export interface RealtimeNotification {
  notificationId: number;
  type: string;
  title: string;
  message: string;
  priority: string;
  category: string;
  userId: number | null;
  actionUrl?: string | null;
  timestamp: string;
}

type AlertHandler = (notification: RealtimeNotification) => void;

const API_BASE = "/api";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 60000;

export function useRealtimeAlerts(onAlert: AlertHandler) {
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onAlertRef = useRef<AlertHandler>(onAlert);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onAlertRef.current = onAlert;

  const connect = useCallback(async () => {
    const token = localStorage.getItem("erp_token") || localStorage.getItem("token");
    if (!token) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/notifications/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }

      retryCountRef.current = 0;

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.eventType === "notification") {
                onAlertRef.current(data as RealtimeNotification);
              }
            } catch {
              // ignore
            }
          }
        }
      }
      scheduleReconnect();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      scheduleReconnect();
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (abortRef.current?.signal.aborted) return;
    if (retryCountRef.current >= MAX_RETRIES) {
      console.warn("[useRealtimeAlerts] Max retries reached, stopping reconnect attempts");
      return;
    }

    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCountRef.current), MAX_DELAY_MS);
    retryCountRef.current += 1;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    retryTimerRef.current = setTimeout(() => {
      if (!abortRef.current?.signal.aborted) {
        connect();
      }
    }, delay);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      try { readerRef.current?.cancel().catch(() => {}); } catch {}
      readerRef.current = null;
      try { abortRef.current?.abort(); } catch {}
      abortRef.current = null;
    };
  }, [connect]);
}
