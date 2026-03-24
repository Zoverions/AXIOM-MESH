package main

import (
	"context"
	"errors"
	"log"
	"os"
	"time"

	"github.com/axiom-mesh/grid/api"
	"github.com/axiom-mesh/grid/blockchain"
	chainclient "github.com/axiom-mesh/grid/chain"
	localcrypto "github.com/axiom-mesh/grid/crypto"
	"github.com/axiom-mesh/grid/p2p"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/libp2p/go-libp2p"
	dht "github.com/libp2p/go-libp2p-kad-dht"
	p2pcrypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
)

type discoveryNotifee struct {
	h peer.ID
}

func (n *discoveryNotifee) HandlePeerFound(pi peer.AddrInfo) {
	log.Printf("mDNS Discovered new peer: %s", pi.ID.String())
}

func main() {
	log.Println("Initializing AxiomMesh Grid...")

	// 1. Load or Generate Persistent Identity
	priv, err := localcrypto.LoadOrGenerateKey("./data/keystore")
	if err != nil {
		log.Fatalf("Failed to load or generate key: %v", err)
	}

	// 2. Convert secp256k1 key for libp2p
	privBytes := crypto.FromECDSA(priv)
	p2pPriv, err := p2pcrypto.UnmarshalSecp256k1PrivateKey(privBytes)
	if err != nil {
		log.Fatalf("Failed to unmarshal secp256k1 private key: %v", err)
	}

	ctx := context.Background()

	// 3. Initialize libp2p Host
	host, err := libp2p.New(libp2p.Identity(p2pPriv))
	if err != nil {
		log.Fatalf("Failed to create libp2p host: %v", err)
	}
	log.Printf("libp2p Host initialized with ID: %s", host.ID().String())

	// 4. Initialize Kademlia DHT
	kademliaDHT, err := dht.New(ctx, host, dht.Mode(dht.ModeServer))
	if err != nil {
		log.Fatalf("Failed to create DHT: %v", err)
	}
	if err = kademliaDHT.Bootstrap(ctx); err != nil {
		log.Fatalf("Failed to bootstrap DHT: %v", err)
	}

	// 5. Setup mDNS Discovery
	mdnsService := mdns.NewMdnsService(host, "axiom-mesh-grid", &discoveryNotifee{h: host.ID()})
	if err := mdnsService.Start(); err != nil {
		log.Fatalf("Failed to start mDNS service: %v", err)
	}

	// 6. Start Grid Node and Server
	ledger := blockchain.NewLedger()
	ledgerPath := os.Getenv("GRID_LEDGER_PATH")
	if ledgerPath == "" {
		ledgerPath = "./data/ledger_snapshot.json"
	}
	if err := ledger.LoadFromFile(ledgerPath); err == nil {
		log.Printf("Loaded ledger snapshot from %s", ledgerPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Printf("Ledger snapshot load warning: %v", err)
	}

	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := ledger.SaveToFile(ledgerPath); err != nil {
				log.Printf("Failed to persist ledger snapshot: %v", err)
			}
		}
	}()

	// Start automatic historical pruning
	retentionStr := os.Getenv("GRID_LEDGER_RETENTION")
	if retentionStr == "" {
		retentionStr = "24h" // Default 24 hours
	}
	retentionPeriod, err := time.ParseDuration(retentionStr)
	if err != nil {
		log.Printf("Invalid GRID_LEDGER_RETENTION '%s', falling back to 24h: %v", retentionStr, err)
		retentionPeriod = 24 * time.Hour
	}
	ledger.StartPruning(1*time.Hour, retentionPeriod)

	p2pNode := p2p.NewNode(host.ID().String(), priv)
	go p2pNode.Start()

	// 6a. Initialize and start ChainListener if RPC URL is available
	rpcURL := os.Getenv("GRID_ETH_RPC_URL")
	if rpcURL != "" {
		chainListener, err := chainclient.NewChainListener(rpcURL, ledger)
		if err != nil {
			log.Printf("Failed to initialize ChainListener: %v", err)
		} else {
			log.Println("Starting ChainListener for L1 event syncing and reorg handling...")
			chainListener.Start(15 * time.Second) // Poll every 15 seconds
		}
	} else {
		log.Println("GRID_ETH_RPC_URL not set; skipping ChainListener initialization.")
	}

	server := api.NewServer(ledger, p2pNode)
	if c, enabled, err := chainclient.NewComputeBondClientFromEnv(); err != nil {
		log.Printf("ComputeBond client init warning: %v", err)
	} else if enabled {
		server.SetComputeBondClient(c)
		log.Printf("ComputeBond on-chain integration enabled")
	} else {
		log.Printf("ComputeBond on-chain integration disabled (missing GRID_ETH_* env vars)")
	}

	port := os.Getenv("GRID_PORT")
	if port == "" {
		port = "5000"
	}

	log.Printf("Grid API Server listening on port %s", port)
	if err := server.Start(":" + port); err != nil {
		_ = ledger.SaveToFile(ledgerPath)
		log.Fatal("Server failed: ", err)
	}
}
