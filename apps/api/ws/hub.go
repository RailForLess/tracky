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

// addTopics unions topics into the client's subscription set and returns
// the topics that were not already subscribed (caller uses this to send the
// cached snapshot only for newly added topics).
func (c *Client) addTopics(topics []string) []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	var added []string
	for _, t := range topics {
		if _, ok := c.topics[t]; !ok {
			c.topics[t] = struct{}{}
			added = append(added, t)
		}
	}
	return added
}

// removeTopics drops the given topics from the subscription set. Topics
// that aren't currently subscribed are silently ignored.
func (c *Client) removeTopics(topics []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, t := range topics {
		delete(c.topics, t)
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

// Hub manages WebSocket clients and routes messages by topic (typed global id).
type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]struct{}
	publish    chan topicMsg
	deliver    chan clientDelivery
	register   chan *Client
	unregister chan *Client
	done       chan struct{} // closed when Run exits

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
		done:       make(chan struct{}),
		snapshots:  make(map[string][]byte),
	}
}

// Run processes register, unregister, and publish events until ctx is cancelled.
// On exit it closes every client's send channel and signals h.done so producers
// stuck in Publish/DeliverSnapshot fail fast instead of blocking forever.
func (h *Hub) Run(ctx context.Context) {
	defer func() {
		h.mu.Lock()
		for c := range h.clients {
			close(c.send)
			delete(h.clients, c)
		}
		h.mu.Unlock()
		close(h.done)
	}()

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
// Returns false if the hub has shut down (the payload is dropped).
func (h *Hub) DeliverSnapshot(c *Client, payload []byte) bool {
	select {
	case h.deliver <- clientDelivery{client: c, payload: payload}:
		return true
	case <-h.done:
		return false
	}
}

// Publish sends a message to all clients subscribed to the given topic.
// Returns false if the hub has shut down (the payload is dropped).
func (h *Hub) Publish(topic string, payload []byte) bool {
	select {
	case h.publish <- topicMsg{topic: topic, payload: payload}:
		return true
	case <-h.done:
		return false
	}
}

// Snapshot returns a copy of the last published payload for a topic, if any.
// A copy is returned so callers can safely mutate it without racing the hub
// goroutine or future Snapshot readers.
func (h *Hub) Snapshot(topic string) ([]byte, bool) {
	h.snapshotMu.RLock()
	defer h.snapshotMu.RUnlock()
	data, ok := h.snapshots[topic]
	if !ok {
		return nil, false
	}
	out := make([]byte, len(data))
	copy(out, data)
	return out, true
}
