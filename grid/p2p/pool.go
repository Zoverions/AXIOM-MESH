package p2p

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/axiom-mesh/grid/types"
)

// ConnectionPool manages reusable HTTP connections to peers
type ConnectionPool struct {
	mu          sync.RWMutex
	connections map[string]*http.Client
	maxIdle     int
	idleTimeout time.Duration
	tlsConfig   *tls.Config
}

// NewConnectionPool creates a new connection pool with specified parameters
func NewConnectionPool(maxIdle int, idleTimeout time.Duration) *ConnectionPool {
	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS13,
	}

	// Load mTLS certificates
	mtlsClientCert := os.Getenv("MTLS_CLIENT_CERT")
	mtlsClientKey := os.Getenv("MTLS_CLIENT_KEY")
	mtlsCaCert := os.Getenv("MTLS_CA_CERT")

	if mtlsClientCert != "" && mtlsClientKey != "" && mtlsCaCert != "" {
		cert, err := tls.X509KeyPair([]byte(mtlsClientCert), []byte(mtlsClientKey))
		if err == nil {
			tlsConfig.Certificates = []tls.Certificate{cert}
		}
		caCertPool := x509.NewCertPool()
		caCertPool.AppendCertsFromPEM([]byte(mtlsCaCert))
		tlsConfig.RootCAs = caCertPool
	} else {
		certsDir := os.Getenv("CERTS_DIR")
		if certsDir == "" {
			certsDir = "certs"
			if _, err := os.Stat(certsDir); os.IsNotExist(err) {
				certsDir = "../certs"
				if _, err := os.Stat(certsDir); os.IsNotExist(err) {
					certsDir = "../../certs"
				}
			}
		}

		certFile := filepath.Join(certsDir, "grid.crt")
		keyFile := filepath.Join(certsDir, "grid.key")
		caFile := filepath.Join(certsDir, "ca.crt")

		if _, err := os.Stat(certFile); err == nil {
			cert, err := tls.LoadX509KeyPair(certFile, keyFile)
			if err == nil {
				tlsConfig.Certificates = []tls.Certificate{cert}
			}

			caCert, err := ioutil.ReadFile(caFile)
			if err == nil {
				caCertPool := x509.NewCertPool()
				caCertPool.AppendCertsFromPEM(caCert)
				tlsConfig.RootCAs = caCertPool
			}
		}
	}

	return &ConnectionPool{
		connections: make(map[string]*http.Client),
		maxIdle:     maxIdle,
		idleTimeout: idleTimeout,
		tlsConfig:   tlsConfig,
	}
}

// GetClient returns an HTTP client for the given peer address
func (p *ConnectionPool) GetClient(peerAddr string) *http.Client {
	p.mu.RLock()
	client, exists := p.connections[peerAddr]
	p.mu.RUnlock()

	if exists && client != nil {
		return client
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	// Double-check after acquiring write lock
	if client, exists = p.connections[peerAddr]; exists && client != nil {
		return client
	}

	// Create new connection with pooling
	transport := &http.Transport{
		TLSClientConfig:       p.tlsConfig,
		MaxIdleConns:          p.maxIdle,
		MaxIdleConnsPerHost:   p.maxIdle,
		IdleConnTimeout:       p.idleTimeout,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	client = &http.Client{
		Timeout:   30 * time.Second,
		Transport: transport,
	}

	p.connections[peerAddr] = client

	// Cleanup old connections if pool is full
	if len(p.connections) > p.maxIdle*2 {
		p.cleanup()
	}

	return client
}

// Close closes all connections in the pool
func (p *ConnectionPool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for addr, client := range p.connections {
		if client.Transport != nil {
			if transport, ok := client.Transport.(*http.Transport); ok {
				transport.CloseIdleConnections()
			}
		}
		delete(p.connections, addr)
	}
}

// cleanup removes idle connections
func (p *ConnectionPool) cleanup() {
	// Simple cleanup strategy - remove oldest connections
	// In production, use LRU or time-based eviction
	count := 0
	for addr := range p.connections {
		if count >= p.maxIdle {
			if client := p.connections[addr]; client != nil {
				if transport, ok := client.Transport.(*http.Transport); ok {
					transport.CloseIdleConnections()
				}
			}
			delete(p.connections, addr)
		}
		count++
	}
}

// WorkerPool manages concurrent task execution for P2P operations
type WorkerPool struct {
	workerCount int
	taskChan    chan func()
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
}

// NewWorkerPool creates a worker pool with specified number of workers
func NewWorkerPool(workerCount int) *WorkerPool {
	ctx, cancel := context.WithCancel(context.Background())

	pool := &WorkerPool{
		workerCount: workerCount,
		taskChan:    make(chan func(), workerCount*10),
		ctx:         ctx,
		cancel:      cancel,
	}

	// Start workers
	for i := 0; i < workerCount; i++ {
		pool.wg.Add(1)
		go pool.worker(i)
	}

	return pool
}

// worker processes tasks from the channel
func (p *WorkerPool) worker(id int) {
	defer p.wg.Done()

	for {
		select {
		case task, ok := <-p.taskChan:
			if !ok {
				return
			}
			// Execute task with panic recovery
			func() {
				defer func() {
					if r := recover(); r != nil {
						fmt.Printf("Worker %d recovered from panic: %v\n", id, r)
					}
				}()
				task()
			}()
		case <-p.ctx.Done():
			return
		}
	}
}

// Submit adds a task to the worker pool
func (p *WorkerPool) Submit(task func()) bool {
	select {
	case p.taskChan <- task:
		return true
	case <-p.ctx.Done():
		return false
	default:
		// Channel full, task rejected
		return false
	}
}

// SubmitWait adds a task and waits for completion
func (p *WorkerPool) SubmitWait(task func()) {
	done := make(chan struct{})
	p.Submit(func() {
		defer close(done)
		task()
	})
	<-done
}

// Shutdown gracefully shuts down the worker pool
func (p *WorkerPool) Shutdown(timeout time.Duration) {
	p.cancel()

	// Wait for workers to finish with timeout
	done := make(chan struct{})
	go func() {
		p.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		// Clean shutdown
	case <-time.After(timeout):
		fmt.Println("Worker pool shutdown timed out")
	}

	close(p.taskChan)
}

// Stats returns worker pool statistics
type PoolStats struct {
	WorkerCount   int `json:"worker_count"`
	QueueLength   int `json:"queue_length"`
	ActiveWorkers int `json:"active_workers"`
}

// GetStats returns current pool statistics
func (p *WorkerPool) GetStats() PoolStats {
	return PoolStats{
		WorkerCount:   p.workerCount,
		QueueLength:   len(p.taskChan),
		ActiveWorkers: p.workerCount, // Simplified - could track active count
	}
}

// P2PNodeWithPooling extends Node with connection and worker pooling
type P2PNodeWithPooling struct {
	*Node
	connPool      *ConnectionPool
	workerPool    *WorkerPool
	broadcastWg   sync.WaitGroup
	maxRetries    int
	retryDelay    time.Duration
}

// NewP2PNodeWithPooling creates a new P2P node with optimized pooling
func NewP2PNodeWithPooling(id string, priv interface{}, workerCount, connPoolSize int) *P2PNodeWithPooling {
	node := &P2PNodeWithPooling{
		Node:       nil, // Will be initialized separately
		connPool:   NewConnectionPool(connPoolSize, 90*time.Second),
		workerPool: NewWorkerPool(workerCount),
		maxRetries: 3,
		retryDelay: 1 * time.Second,
	}

	return node
}

// BroadcastWithPooling broadcasts messages using worker pool and connection pooling
func (n *P2PNodeWithPooling) BroadcastWithPooling(msg types.CCIPMessage) {
	peers := n.snapshotPeers()

	for _, peer := range peers {
		n.broadcastWg.Add(1)
		n.workerPool.Submit(func() {
			defer n.broadcastWg.Done()
			n.sendWithRetry(peer.Address, msg)
		})
	}
}

// sendWithRetry sends a message with exponential backoff
func (n *P2PNodeWithPooling) sendWithRetry(addr string, msg types.CCIPMessage) {
	var lastErr error

	for attempt := 0; attempt < n.maxRetries; attempt++ {
		client := n.connPool.GetClient(addr)

		data, _ := json.Marshal(msg)
		req, err := http.NewRequest("POST", addr+"/ccip?sync=true", bytes.NewBuffer(data))
		if err != nil {
			lastErr = err
			continue
		}

		req.Header.Set("Content-Type", "application/json")
		if transport, ok := n.Transport.(*HTTPTransport); ok {
			if err := transport.BuildSignedHeaders(req, data); err != nil {
				lastErr = err
				continue
			}
		}

		resp, err := client.Do(req)
		if err == nil {
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				resp.Body.Close()
				n.UpdatePeerScore(msg.MessageID, 1)
				return
			}
			resp.Body.Close()
		}

		lastErr = err
		n.IncrementPeerFailure(msg.MessageID)

		// Exponential backoff
		if attempt < n.maxRetries-1 {
			time.Sleep(n.retryDelay * time.Duration(1<<uint(attempt)))
		}
	}

	if lastErr != nil {
		fmt.Printf("Failed to broadcast after %d attempts: %v\n", n.maxRetries, lastErr)
	}
}

// WaitForBroadcasts waits for all pending broadcasts to complete
func (n *P2PNodeWithPooling) WaitForBroadcasts() {
	n.broadcastWg.Wait()
}

// Shutdown gracefully shuts down all pools
func (n *P2PNodeWithPooling) Shutdown(timeout time.Duration) {
	n.WaitForBroadcasts()
	n.workerPool.Shutdown(timeout)
	n.connPool.Close()
}

// GetPoolStats returns combined statistics for monitoring
func (n *P2PNodeWithPooling) GetPoolStats() map[string]interface{} {
	return map[string]interface{}{
		"worker_pool":   n.workerPool.GetStats(),
		"connection_pool_size": len(n.connPool.connections),
		"peer_count":    len(n.Peers),
	}
}
