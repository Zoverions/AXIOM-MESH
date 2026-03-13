package consensus

import (
	"testing"
)

func TestCalculateWork(t *testing.T) {
	taskID := "test-task"

	// We'll find a few nonces manually or via Mine to test CalculateWork
	nonce1 := MineEntropyReduction(taskID)
	work1 := CalculateWork(taskID, nonce1)
	if work1 < Difficulty {
		t.Errorf("MineEntropyReduction produced nonce with work %d, expected at least %d", work1, Difficulty)
	}

	// Test with a nonce we know has 0 work (unlikely but possible to have leading zeros,
	// so we check if it's less than something large)
	nonceZero := "something-unlikely-to-have-leading-zeros"
	workZero := CalculateWork(taskID, nonceZero)
	if workZero >= 256 {
		t.Errorf("CalculateWork produced impossible work %d", workZero)
	}
}

func TestMineEntropyReduction(t *testing.T) {
	taskID := "mine-test"
	nonce := MineEntropyReduction(taskID)
	if nonce == "" {
		t.Fatal("MineEntropyReduction returned empty nonce")
	}

	if CalculateWork(taskID, nonce) < Difficulty {
		t.Errorf("MineEntropyReduction produced invalid nonce %s", nonce)
	}
}
