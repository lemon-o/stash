package manager

import (
	"context"
	"sync"
	"time"
)

type subscriptionManager struct {
	subscriptions []chan bool
	mutex         sync.Mutex
	lastNotify    time.Time
}

func (m *subscriptionManager) subscribe(ctx context.Context) <-chan bool {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	c := make(chan bool, 10)
	m.subscriptions = append(m.subscriptions, c)

	go func() {
		<-ctx.Done()
		m.mutex.Lock()
		defer m.mutex.Unlock()
		close(c)

		for i, s := range m.subscriptions {
			if s == c {
				m.subscriptions = append(m.subscriptions[:i], m.subscriptions[i+1:]...)
				break
			}
		}
	}()

	return c
}

func (m *subscriptionManager) notify() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	m.lastNotify = time.Now()
	for _, s := range m.subscriptions {
		select {
		case s <- true:
		default:
		}
	}
}

// notifyThrottled triggers a notification at most once per minInterval to support live streaming updates during scan
func (m *subscriptionManager) notifyThrottled(minInterval time.Duration) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	now := time.Now()
	if now.Sub(m.lastNotify) < minInterval {
		return
	}
	m.lastNotify = now

	for _, s := range m.subscriptions {
		select {
		case s <- true:
		default:
		}
	}
}
