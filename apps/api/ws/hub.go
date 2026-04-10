package ws

import (
	"context"
	"sync"

	"github.com/gorilla/websocket"
)

// Client represents a single WebSocket connection.
type Client struct {
	conn   *websocket.Conn
	send   chan []byte
	mu     sync.RWMutex
	topics map[string]struct{}
}

func (c *Client) subscribedTo(topic string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.topics[topic]
	return ok
}

func (c *Client) setTopics(providers []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.topics = make(map[string]struct{}, len(providers))
	for _, p := range providers {
		c.topics[p] = struct{}{}
	}
}

type topicMsg struct {
	topic   string
	payload []byte
}

// Hub manages WebSocket clients and routes messages by topic (provider ID).
type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]struct{}
	publish    chan topicMsg
	register   chan *Client
	unregister chan *Client

	snapshotMu sync.RWMutex
	snapshots  map[string][]byte
}

// NewHub returns a Hub ready to Run.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]struct{}),
		publish:    make(chan topicMsg, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		snapshots:  make(map[string][]byte),
	}
}

// Run processes register, unregister, and publish events until ctx is cancelled.
func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return

		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = struct{}{}
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()

		case msg := <-h.publish:
			h.snapshotMu.Lock()
			h.snapshots[msg.topic] = msg.payload
			h.snapshotMu.Unlock()

			h.mu.RLock()
			for c := range h.clients {
				if !c.subscribedTo(msg.topic) {
					continue
				}
				select {
				case c.send <- msg.payload:
				default:
					close(c.send)
					delete(h.clients, c)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Publish sends a message to all clients subscribed to the given topic.
func (h *Hub) Publish(topic string, payload []byte) {
	h.publish <- topicMsg{topic: topic, payload: payload}
}

// Snapshot returns the last published payload for a topic, if any.
func (h *Hub) Snapshot(topic string) ([]byte, bool) {
	h.snapshotMu.RLock()
	defer h.snapshotMu.RUnlock()
	data, ok := h.snapshots[topic]
	return data, ok
}
