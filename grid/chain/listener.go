package chain

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

type ChainListener struct {
	client       *ethclient.Client
	ledger       *blockchain.Ledger
	lastBlockHash string
	ticker       *time.Ticker
	quit         chan struct{}
}

func NewChainListener(rpcURL string, ledger *blockchain.Ledger) (*ChainListener, error) {
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, err
	}
	return &ChainListener{
		client: client,
		ledger: ledger,
		quit:   make(chan struct{}),
	}, nil
}

func (c *ChainListener) Start(interval time.Duration) {
	c.ticker = time.NewTicker(interval)
	go func() {
		for {
			select {
			case <-c.ticker.C:
				if err := c.PollBlocks(); err != nil {
					log.Printf("ChainListener PollBlocks error: %v", err)
				}
			case <-c.quit:
				c.ticker.Stop()
				return
			}
		}
	}()
}

func (c *ChainListener) Stop() {
	close(c.quit)
}

func (c *ChainListener) PollBlocks() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	header, err := c.client.HeaderByNumber(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to get latest header: %w", err)
	}

	currentBlockHash := header.Hash().Hex()

	if c.lastBlockHash != "" && c.lastBlockHash != header.ParentHash.Hex() {
		// Reorg detected: The current block's parent hash doesn't match our last known block hash
		log.Printf("Reorg detected! Expected parent %s, got %s. Rolling back GPP balances.", c.lastBlockHash, header.ParentHash.Hex())
		c.handleReorg(header)
	}

	c.lastBlockHash = currentBlockHash
	return nil
}

func (c *ChainListener) handleReorg(newHeader *types.Header) {
	// Reorg logic: Rollback the GPPBalances state
	// In a complete implementation, this would involve applying reverse events from the ledger's event log
	// up to the common ancestor. Here we implement the core rollback call.
	err := c.ledger.RollbackGPPBalances(c.lastBlockHash)
	if err != nil {
		log.Printf("Failed to rollback GPP balances: %v", err)
	} else {
		log.Println("Successfully rolled back GPP balances.")
	}
}
