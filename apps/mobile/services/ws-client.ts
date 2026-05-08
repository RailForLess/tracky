/**
 * Singleton WebSocket client for the realtime feed at `wsUrl` (config.ts).
 *
 * Usage:
 *   const off = wsClient.subscribe(['amtrak'], (update) => { ... });
 *   off(); // unsubscribe + drop topic if no other listeners want it
 *
 * Wire format: see apps/api/ws/poller.go (RealtimeUpdate envelope).
 * Subscription protocol: see apps/api/ws/handler.go (clientMsg).
 */

import { config } from '../constants/config';
import type { RealtimeUpdate } from '../types/api';
import { logger } from '../utils/logger';

type Listener = (update: RealtimeUpdate) => void;
type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface ProviderSubscription {
  refCount: number;
  /** True once the server has acknowledged (i.e. we sent subscribe while open). */
  sentToServer: boolean;
}

class WSClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private listeners = new Set<Listener>();
  private subscriptions = new Map<string, ProviderSubscription>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  /**
   * Subscribe a listener to one or more providers. Returns an unsubscribe
   * function. Listeners are invoked for *every* RealtimeUpdate the socket
   * delivers — filter by `update.provider` in the listener if needed.
   */
  subscribe(providers: string[], listener: Listener): () => void {
    this.listeners.add(listener);

    for (const p of providers) {
      const existing = this.subscriptions.get(p);
      if (existing) {
        existing.refCount += 1;
      } else {
        this.subscriptions.set(p, { refCount: 1, sentToServer: false });
      }
    }

    this.ensureConnected();
    this.flushSubscribeIfOpen(providers);

    return () => {
      this.listeners.delete(listener);
      const drop: string[] = [];
      for (const p of providers) {
        const s = this.subscriptions.get(p);
        if (!s) continue;
        s.refCount -= 1;
        if (s.refCount <= 0) {
          drop.push(p);
          this.subscriptions.delete(p);
        }
      }
      if (drop.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ action: 'unsubscribe', providers: drop });
      }
      // No listeners → close the socket so we don't hold a connection open.
      if (this.listeners.size === 0) {
        this.close();
      }
    };
  }

  /**
   * Permanently close the socket and cancel any pending reconnect. Subscribe()
   * after close() is supported and will re-open.
   */
  close(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        logger.warn('[ws-client] error closing socket', e);
      }
      this.ws = null;
    }
    this.state = 'closed';
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (this.state === 'connecting' || this.state === 'open') return;
    this.intentionallyClosed = false;
    this.connect();
  }

  private connect(): void {
    this.state = 'connecting';
    try {
      this.ws = new WebSocket(config.wsUrl);
    } catch (err) {
      logger.error('[ws-client] WebSocket constructor threw', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state = 'open';
      this.reconnectAttempts = 0;
      // (Re-)subscribe everything we had registered.
      const providers = Array.from(this.subscriptions.keys());
      if (providers.length > 0) {
        this.send({ action: 'subscribe', providers });
        for (const p of providers) {
          const s = this.subscriptions.get(p);
          if (s) s.sentToServer = true;
        }
      }
      logger.debug(`[ws-client] connected, subscribed to ${providers.join(',')}`);
    };

    this.ws.onmessage = event => {
      let parsed: unknown;
      try {
        parsed = typeof event.data === 'string' ? JSON.parse(event.data) : null;
      } catch {
        logger.warn('[ws-client] non-JSON message', event.data);
        return;
      }
      if (!isRealtimeUpdate(parsed)) return;
      for (const l of this.listeners) {
        try {
          l(parsed);
        } catch (e) {
          logger.error('[ws-client] listener threw', e);
        }
      }
    };

    this.ws.onerror = err => {
      logger.warn('[ws-client] socket error', err);
    };

    this.ws.onclose = () => {
      this.state = 'closed';
      // Server-side or transport close. Mark all subscriptions as not-sent so
      // the next connect re-sends them.
      for (const s of this.subscriptions.values()) s.sentToServer = false;
      this.ws = null;
      if (!this.intentionallyClosed && this.listeners.size > 0) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const attempt = this.reconnectAttempts++;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    logger.debug(`[ws-client] reconnecting in ${delay}ms (attempt ${attempt + 1})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(msg: { action: 'subscribe' | 'unsubscribe'; providers: string[] }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      logger.warn('[ws-client] send failed', e);
    }
  }

  private flushSubscribeIfOpen(providers: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const toSend = providers.filter(p => {
      const s = this.subscriptions.get(p);
      return s && !s.sentToServer;
    });
    if (toSend.length === 0) return;
    this.send({ action: 'subscribe', providers: toSend });
    for (const p of toSend) {
      const s = this.subscriptions.get(p);
      if (s) s.sentToServer = true;
    }
  }
}

function isRealtimeUpdate(value: unknown): value is RealtimeUpdate {
  if (!value || typeof value !== 'object') return false;
  const v = value as { type?: unknown; provider?: unknown; positions?: unknown };
  return (
    v.type === 'realtime_update' &&
    typeof v.provider === 'string' &&
    Array.isArray(v.positions)
  );
}

export const wsClient = new WSClient();
