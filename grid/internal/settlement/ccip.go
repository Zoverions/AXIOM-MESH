package settlement

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
)

// CCIPIntegration handles cross-chain settlements using CCIP.
type CCIPIntegration struct {
	BridgeAddress   string
	SupportedChains map[string]bool
}

// SettlementResult represents the result of a settlement initiation.
type SettlementResult struct {
	Status      string
	Source      string
	Destination string
	Amount      float64
	Recipient   string
	TxHash      string
}

// NewCCIPIntegration initializes a new CCIP integration instance.
func NewCCIPIntegration(bridgeAddress string) *CCIPIntegration {
	if bridgeAddress == "" {
		bridgeAddress = "0xCCIP_BRIDGE"
	}
	supported := map[string]bool{
		"Ethereum": true,
		"Base":     true,
		"Polygon":  true,
		"Arbitrum": true,
	}
	return &CCIPIntegration{
		BridgeAddress:   bridgeAddress,
		SupportedChains: supported,
	}
}

// InitiateSettlement initiates a cross-chain settlement.
func (c *CCIPIntegration) InitiateSettlement(sourceChain, destChain string, amount float64, recipient string) (*SettlementResult, error) {
	if !c.SupportedChains[sourceChain] {
		return nil, fmt.Errorf("unsupported source chain: %s", sourceChain)
	}
	if !c.SupportedChains[destChain] {
		return nil, fmt.Errorf("unsupported destination chain: %s", destChain)
	}
	if amount <= 0 {
		return nil, errors.New("amount must be greater than zero")
	}
	if recipient == "" {
		return nil, errors.New("recipient address cannot be empty")
	}

	hashInput := fmt.Sprintf("%s:%s:%f:%s", sourceChain, destChain, amount, recipient)
	hash := sha256.Sum256([]byte(hashInput))
	txHash := "0x_ccip_" + hex.EncodeToString(hash[:])

	return &SettlementResult{
		Status:      "settlement_initiated",
		Source:      sourceChain,
		Destination: destChain,
		Amount:      amount,
		Recipient:   recipient,
		TxHash:      txHash,
	}, nil
}
