package main

import (
	"context"
	"log"
	"os"

	"github.com/axiom-mesh/grid/api"
	"github.com/axiom-mesh/grid/blockchain"
	localcrypto "github.com/axiom-mesh/grid/crypto"
	"github.com/axiom-mesh/grid/p2p"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/peer"
	p2pcrypto "github.com/libp2p/go-libp2p/core/crypto"
	dht "github.com/libp2p/go-libp2p-kad-dht"
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
	p2pNode := p2p.NewNode(host.ID().String(), priv)
	go p2pNode.Start()

	server := api.NewServer(ledger, p2pNode)

	port := os.Getenv("GRID_PORT")
	if port == "" {
		port = "5000"
	}

	log.Printf("Grid API Server listening on port %s", port)
	if err := server.Start(":" + port); err != nil {
		log.Fatal("Server failed: ", err)
	}
}
