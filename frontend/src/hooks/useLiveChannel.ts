import { useEffect, useRef, useState } from "react";

export type Channel = "admin" | "tv" | "kids" | "status";

export interface LiveState<T> {
  data: T | null;
  connected: boolean;
  /** Fermeture définitive (ex. 4401 : session admin absente). */
  closedCode: number | null;
  /** Décalage horloge serveur - horloge locale, en ms. */
  clockOffset: number;
}

export function wsUrl(channel: Channel, loc: Location = window.location): string {
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${loc.host}/ws?channel=${channel}`;
}

/** Reconnexion avec backoff (1 s → 10 s max). */
export function backoffDelay(attempt: number): number {
  return Math.min(10_000, 1000 * 2 ** Math.min(attempt, 4));
}

const FATAL_CODES = new Set([4400, 4401]);

/** Abonnement à un canal WebSocket en lecture seule ; chaque message contient l'état complet. */
export function useLiveChannel<T extends { server_time?: string }>(channel: Channel, enabled = true): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>({ data: null, connected: false, closedCode: null, clockOffset: 0 });
  const attempts = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let disposed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl(channel));
      ws.onopen = () => {
        attempts.current = 0;
        setState((s) => ({ ...s, connected: true, closedCode: null }));
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type !== "state") return;
          const data = msg.data as T;
          const offset = data.server_time ? Date.parse(data.server_time) - Date.now() : 0;
          setState((s) => ({ ...s, data, clockOffset: offset }));
        } catch {
          /* message ignoré */
        }
      };
      ws.onclose = (ev) => {
        clearInterval(ping);
        if (disposed) return;
        if (FATAL_CODES.has(ev.code)) {
          setState((s) => ({ ...s, connected: false, closedCode: ev.code }));
          return;
        }
        setState((s) => ({ ...s, connected: false }));
        retry = setTimeout(connect, backoffDelay(attempts.current++));
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
    };
  }, [channel, enabled]);

  return state;
}
