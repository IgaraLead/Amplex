import { useEffect } from 'react';
import { queryClient } from '@/shared/queryClient';

type RealtimePayload = {
  domain?: string;
  type?: string;
  lead_id?: number;
};

const invalidateAfterLeadsUpdated = (data: RealtimePayload) => {
  void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
  void queryClient.invalidateQueries({ queryKey: ['leads'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard-advanced'] });
  void queryClient.invalidateQueries({ queryKey: ['next-contacts'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: ['contacts'] });
  const lid = data.lead_id;
  if (typeof lid === 'number') {
    void queryClient.invalidateQueries({ queryKey: ['lead', lid] });
    void queryClient.invalidateQueries({ queryKey: ['interactions', lid] });
    void queryClient.invalidateQueries({ queryKey: ['lead-attachments', lid] });
  }
};

const RECONNECT_BASE_MS = 1_200;
const RECONNECT_MAX_MS = 45_000;
const RECONNECT_JITTER_MS = 600;

const nextReconnectDelayMs = (attempt: number) => {
  const exp = Math.min(attempt, 10);
  const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** exp);
  const jitter = Math.floor(Math.random() * RECONNECT_JITTER_MS);
  return backoff + jitter;
};

export const useOrgRealtime = (slug: string | undefined) => {
  useEffect(() => {
    if (!slug) return undefined;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/amplex/ws/org/${encodeURIComponent(slug)}/`;

    let activeWs: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;
    let connectGeneration = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      clearReconnectTimer();
      if (stopped) return;
      const delay = nextReconnectDelayMs(attempt);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!stopped) connect();
      }, delay);
    };

    const connect = () => {
      if (stopped) return;
      clearReconnectTimer();
      const gen = (connectGeneration += 1);
      const ws = new WebSocket(url);
      activeWs = ws;

      ws.onopen = () => {
        if (stopped || gen !== connectGeneration) return;
        attempt = 0;
      };

      ws.onmessage = (ev: MessageEvent<string>) => {
        try {
          const data = JSON.parse(ev.data) as RealtimePayload;
          if (data.domain !== 'amplex' || data.type !== 'leads_updated') return;
          invalidateAfterLeadsUpdated(data);
        } catch {
          /* ignore malformed */
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        if (gen !== connectGeneration) return;
        activeWs = null;
        if (stopped) return;
        scheduleReconnect();
      };
    };

    const handleOnline = () => {
      if (stopped) return;
      if (activeWs?.readyState === WebSocket.OPEN) return;
      clearReconnectTimer();
      connectGeneration += 1;
      activeWs?.close();
      activeWs = null;
      attempt = 0;
      connect();
    };

    window.addEventListener('online', handleOnline);
    connect();

    return () => {
      stopped = true;
      connectGeneration += 1;
      clearReconnectTimer();
      window.removeEventListener('online', handleOnline);
      activeWs?.close();
      activeWs = null;
    };
  }, [slug]);
};
