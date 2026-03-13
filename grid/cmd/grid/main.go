package main

import (
	"log"
	"os"

	"github.com/axiom-mesh/grid/api"
	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/p2p"
)

func main() {
	log.Println("Initializing AxiomMesh Grid...")

	ledger := blockchain.NewLedger()
	p2pNode := p2p.NewNode("node-0")
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
