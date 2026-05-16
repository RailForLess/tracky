/**
 * Singleton WebSocket client for the realtime feed at `wsUrl` (config.ts).
 *
 * Usage:
 *   const off = wsClient.subscribe(['o-amtrak'], (update) => { ... });
 *   off(); // unsubscribe + drop topic if no other listeners want it
 *
 * Topics are typed global ids (see utils/ids.ts). Today only operator topics
 * are published; future versions will also publish route/trip/vehicle topics.
 *
 * Wire format: see apps/api/ws/poller.go (RealtimeUpdate envelope).
 * Subscription protocol: see apps/api/ws/handler.go (clientMsg).
 */

import { config } from '../constants/config';
import type { ApiTrainPosition, RealtimeUpdate } from '../types/api';
import { encodeId } from '../utils/ids';
import { logger } from '../utils/logger';

type Listener = (update: RealtimeUpdate) => void;
type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface TopicSubscription {
  refCount: number;
  /** True once the server has acknowledged (i.e. we sent subscribe while open). */
  sentToServer: boolean;
}

/** Normalize a caller-supplied topic id. Bare provider names become o- ids. */
function toTopic(topicOrProvider: string): string {
  if (topicOrProvider.includes('-')) return topicOrProvider;
  return encodeId('o', topicOrProvider, '');
}

class WSClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private listeners = new Set<Listener>();
  private subscriptions = new Map<string, TopicSubscription>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  /** Per-provider snapshot of the last positions array we received. */
  private latest = new Map<string, ApiTrainPosition[]>();

  /**
   * Subscribe a listener to one or more topics (typed global ids). For
   * backwards compatibility, bare provider names are auto-encoded as o- ids.
   * Returns an unsubscribe function. Listeners are invoked for *every*
   * RealtimeUpdate the socket delivers — filter by `update.provider` in the
   * listener if needed.
   */
  subscribe(topicsOrProviders: string[], listener: Listener): () => void {
    this.listeners.add(listener);
    const topics = topicsOrProviders.map(toTopic);

    for (const t of topics) {
      const existing = this.subscriptions.get(t);
      if (existing) {
        existing.refCount += 1;
      } else {
        this.subscriptions.set(t, { refCount: 1, sentToServer: false });
      }
    }

    this.ensureConnected();
    this.flushSubscribeIfOpen(topics);

    return () => {
      this.listeners.delete(listener);
      const drop: string[] = [];
      for (const t of topics) {
        const s = this.subscriptions.get(t);
        if (!s) continue;
        s.refCount -= 1;
        if (s.refCount <= 0) {
          drop.push(t);
          this.subscriptions.delete(t);
        }
      }
      if (drop.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ action: 'unsubscribe', topics: drop });
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

  /** All known live positions across providers, in arrival order. */
  getLatestPositions(): ApiTrainPosition[] {
    const out: ApiTrainPosition[] = [];
    for (const list of this.latest.values()) for (const p of list) out.push(p);
    return out;
  }

  /** Latest live position for a specific run, or undefined if not present. */
  findPosition(opts: { provider: string; tripId?: string; trainNumber?: string }):
    | ApiTrainPosition
    | undefined {
    const list = this.latest.get(opts.provider);
    if (!list) return undefined;
    return list.find(
      p =>
        (opts.tripId !== undefined && p.tripId === opts.tripId) ||
        (opts.trainNumber !== undefined && p.trainNumber === opts.trainNumber),
    );
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (this.state === 'connecting' || this.state === 'open') return;
    this.intentionallyClosed = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
      const topics = Array.from(this.subscriptions.keys());
      if (topics.length > 0) {
        this.send({ action: 'subscribe', topics });
        for (const t of topics) {
          const s = this.subscriptions.get(t);
          if (s) s.sentToServer = true;
        }
      }
      logger.debug(`[ws-client] connected, subscribed to ${topics.join(',')}`);
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
      this.latest.set(parsed.provider, parsed.positions);
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

  private send(msg: { action: 'subscribe' | 'unsubscribe'; topics: string[] }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      logger.warn('[ws-client] send failed', e);
    }
  }

  private flushSubscribeIfOpen(topics: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const toSend = topics.filter(t => {
      const s = this.subscriptions.get(t);
      return s && !s.sentToServer;
    });
    if (toSend.length === 0) return;
    this.send({ action: 'subscribe', topics: toSend });
    for (const t of toSend) {
      const s = this.subscriptions.get(t);
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
