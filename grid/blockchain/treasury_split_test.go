package blockchain

import (
	"testing"
)

func TestTreasurySplit(t *testing.T) {
	ledger := NewLedger()

	// Update to 70% Network Security, 30% Wealth Generation
	err := ledger.UpdateTreasurySplit(70, 30)
	if err != nil {
		t.Fatalf("expected no error updating split, got %v", err)
	}

	if ledger.TreasurySplit.NetworkSecurityFund != 70 || ledger.TreasurySplit.WealthGenerationPool != 30 {
		t.Fatalf("expected 70/30 split, got %d/%d", ledger.TreasurySplit.NetworkSecurityFund, ledger.TreasurySplit.WealthGenerationPool)
	}

	// Test invalid split
	err = ledger.UpdateTreasurySplit(80, 30)
	if err == nil {
		t.Fatalf("expected error updating invalid split (80+30=110), got nil")
	}

	// Test DistributeRewards
	ledger.DistributeRewards(1000)

	if ledger.NetworkSecPool != 700 {
		t.Fatalf("expected 700 in Network Security Pool, got %d", ledger.NetworkSecPool)
	}
	if ledger.WealthGenPool != 300 {
		t.Fatalf("expected 300 in Wealth Generation Pool, got %d", ledger.WealthGenPool)
	}

	// Test L1 piggyback settlement queueing
	id := ledger.QueueL1Settlement("0xABC123", 500, "GPP")
	if id == "" {
		t.Fatalf("expected non-empty settlement ID")
	}

	if len(ledger.RelayerQueue) != 1 {
		t.Fatalf("expected 1 item in relayer queue, got %d", len(ledger.RelayerQueue))
	}

	settlement := ledger.RelayerQueue[0]
	if settlement.Recipient != "0xABC123" || settlement.Amount != 500 || settlement.Token != "GPP" || settlement.Status != "Queued" {
		t.Fatalf("settlement item details mismatch")
	}
}

func TestERC20GPP(t *testing.T) {
	ledger := NewLedger()
	recipient := "0xRecipientUser"

	// Mint GPP
	ledger.MintGPP(recipient, 1000)

	if ledger.GPPBalances[recipient] != 1000 {
		t.Fatalf("expected balance 1000, got %d", ledger.GPPBalances[recipient])
	}

	if len(ledger.GPPEvents) != 1 {
		t.Fatalf("expected 1 GPPEvent for Mint")
	}

	mintEvent := ledger.GPPEvents[0]
	if mintEvent.Type != "Mint" || mintEvent.From != "0x0000000000000000000000000000000000000000" || mintEvent.To != recipient || mintEvent.Amount != 1000 {
		t.Fatalf("Mint event details mismatch")
	}

	// Burn GPP
	err := ledger.BurnGPP(recipient, 400)
	if err != nil {
		t.Fatalf("expected no error burning GPP, got %v", err)
	}

	if ledger.GPPBalances[recipient] != 600 {
		t.Fatalf("expected balance 600 after burning 400, got %d", ledger.GPPBalances[recipient])
	}

	if len(ledger.GPPEvents) != 2 {
		t.Fatalf("expected 2 GPPEvents (1 Mint, 1 Burn)")
	}

	burnEvent := ledger.GPPEvents[1]
	if burnEvent.Type != "Burn" || burnEvent.To != "0x0000000000000000000000000000000000000000" || burnEvent.From != recipient || burnEvent.Amount != 400 {
		t.Fatalf("Burn event details mismatch")
	}

	// Test insufficient balance burn
	err = ledger.BurnGPP(recipient, 1000)
	if err == nil {
		t.Fatalf("expected error when burning more than balance, got nil")
	}
}
