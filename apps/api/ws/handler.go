package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 45 * time.Second
	maxMsgSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO: restrict in production
	},
}

type clientMsg struct {
	Action string   `json:"action"` // "subscribe" | "unsubscribe"
	Topics []string `json:"topics"` // typed global ids, e.g. ["o-amtrak", "o-cta"]
}

// Handler returns an http.HandlerFunc that upgrades connections to WebSocket.
func Handler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("ws upgrade: %v", err)
			return
		}

		client := &Client{
			conn:   conn,
			send:   make(chan []byte, 64),
			topics: make(map[string]struct{}),
		}
		hub.register <- client

		go writePump(client)
		go readPump(hub, client)
	}
}

func writePump(c *Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func readPump(hub *Hub, c *Client) {
	defer func() {
		hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMsgSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		var msg clientMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		switch msg.Action {
		case "subscribe":
			// Additive: add to the existing subscription set instead of replacing it.
			// Send cached snapshots only for newly added topics so a client that
			// re-subscribes to something it already had doesn't get a duplicate.
			added := c.addTopics(msg.Topics)
			for _, t := range added {
				if snapshot, ok := hub.Snapshot(t); ok {
					// Route through the hub goroutine so c.send is only
					// written by the hub, avoiding a race with close on
					// unregister/backpressure.
					hub.DeliverSnapshot(c, snapshot)
				}
			}
		case "unsubscribe":
			// Targeted: remove only the listed topics. An empty/missing list
			// clears all subscriptions (preserves the original "unsubscribe = stop
			// everything" shortcut).
			if len(msg.Topics) == 0 {
				c.clearTopics()
			} else {
				c.removeTopics(msg.Topics)
			}
		}
	}
}
