package settlement

import (
	"strings"
	"testing"
)

func TestInitiateSettlement(t *testing.T) {
	ccip := NewCCIPIntegration("")

	t.Run("successful settlement", func(t *testing.T) {
		res, err := ccip.InitiateSettlement("Ethereum", "Base", 100.0, "0x123")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if res.Status != "settlement_initiated" {
			t.Errorf("expected status 'settlement_initiated', got %s", res.Status)
		}
		if res.Source != "Ethereum" {
			t.Errorf("expected source 'Ethereum', got %s", res.Source)
		}
		if res.Destination != "Base" {
			t.Errorf("expected destination 'Base', got %s", res.Destination)
		}
		if res.Amount != 100.0 {
			t.Errorf("expected amount 100.0, got %f", res.Amount)
		}
		if res.Recipient != "0x123" {
			t.Errorf("expected recipient '0x123', got %s", res.Recipient)
		}
		if !strings.HasPrefix(res.TxHash, "0x_ccip_") {
			t.Errorf("expected TxHash to start with '0x_ccip_', got %s", res.TxHash)
		}
	})

	t.Run("unsupported source chain", func(t *testing.T) {
		_, err := ccip.InitiateSettlement("Solana", "Base", 100.0, "0x123")
		if err == nil || !strings.Contains(err.Error(), "unsupported source chain") {
			t.Errorf("expected unsupported source chain error, got %v", err)
		}
	})

	t.Run("unsupported destination chain", func(t *testing.T) {
		_, err := ccip.InitiateSettlement("Ethereum", "Solana", 100.0, "0x123")
		if err == nil || !strings.Contains(err.Error(), "unsupported destination chain") {
			t.Errorf("expected unsupported destination chain error, got %v", err)
		}
	})

	t.Run("zero amount", func(t *testing.T) {
		_, err := ccip.InitiateSettlement("Ethereum", "Base", 0.0, "0x123")
		if err == nil || !strings.Contains(err.Error(), "amount must be greater than zero") {
			t.Errorf("expected zero amount error, got %v", err)
		}
	})

	t.Run("empty recipient", func(t *testing.T) {
		_, err := ccip.InitiateSettlement("Ethereum", "Base", 100.0, "")
		if err == nil || !strings.Contains(err.Error(), "recipient address cannot be empty") {
			t.Errorf("expected empty recipient error, got %v", err)
		}
	})
}
