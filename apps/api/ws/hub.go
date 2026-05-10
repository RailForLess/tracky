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

// addTopics unions providers into the client's subscription set and returns
// the topics that were not already subscribed (caller uses this to send the
// cached snapshot only for newly added topics).
func (c *Client) addTopics(providers []string) []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	var added []string
	for _, p := range providers {
		if _, ok := c.topics[p]; !ok {
			c.topics[p] = struct{}{}
			added = append(added, p)
		}
	}
	return added
}

// removeTopics drops the given providers from the subscription set. Topics
// that aren't currently subscribed are silently ignored.
func (c *Client) removeTopics(providers []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, p := range providers {
		delete(c.topics, p)
	}
}

// clearTopics removes all subscriptions.
func (c *Client) clearTopics() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.topics = make(map[string]struct{})
}

type topicMsg struct {
	topic   string
	payload []byte
}

type clientDelivery struct {
	client  *Client
	payload []byte
}

// Hub manages WebSocket clients and routes messages by topic (provider ID).
type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]struct{}
	publish    chan topicMsg
	deliver    chan clientDelivery
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
		deliver:    make(chan clientDelivery, 256),
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

			h.mu.Lock()
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
			h.mu.Unlock()

		case d := <-h.deliver:
			// Hub-owned send so c.send is only written by this goroutine,
			// avoiding a race with the close in the unregister/publish paths.
			h.mu.Lock()
			if _, ok := h.clients[d.client]; ok {
				select {
				case d.client.send <- d.payload:
				default:
					close(d.client.send)
					delete(h.clients, d.client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// DeliverSnapshot enqueues payload for delivery to a single client. The send
// is performed by the hub goroutine so it is serialized with register,
// unregister, and publish — preventing a send on a closed c.send channel.
func (h *Hub) DeliverSnapshot(c *Client, payload []byte) {
	h.deliver <- clientDelivery{client: c, payload: payload}
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
