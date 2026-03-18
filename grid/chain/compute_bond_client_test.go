package chain

import "testing"

func TestLoadComputeBondConfigFromEnvDisabledWhenMissing(t *testing.T) {
	t.Setenv("GRID_ETH_RPC_URL", "")
	t.Setenv("GRID_COMPUTE_BOND_ADDRESS", "")
	t.Setenv("GRID_ETH_PRIVATE_KEY", "")
	t.Setenv("GRID_ETH_CHAIN_ID", "31337")

	_, enabled, err := loadComputeBondConfigFromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if enabled {
		t.Fatalf("expected integration to be disabled when env is missing")
	}
}

func TestLoadComputeBondConfigFromEnvEnabled(t *testing.T) {
	t.Setenv("GRID_ETH_RPC_URL", "http://127.0.0.1:8545")
	t.Setenv("GRID_COMPUTE_BOND_ADDRESS", "0x0000000000000000000000000000000000000001")
	t.Setenv("GRID_ETH_PRIVATE_KEY", "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	t.Setenv("GRID_ETH_CHAIN_ID", "31337")

	cfg, enabled, err := loadComputeBondConfigFromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !enabled {
		t.Fatalf("expected integration to be enabled")
	}
	if cfg.ChainID != 31337 {
		t.Fatalf("expected chain id 31337, got %d", cfg.ChainID)
	}
}
