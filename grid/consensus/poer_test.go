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

func TestVerifyEntropyReduction(t *testing.T) {
	taskID := "test-task"
	validNonce := MineEntropyReduction(taskID)

	if !VerifyEntropyReduction(taskID, validNonce) {
		t.Errorf("VerifyEntropyReduction failed for valid nonce %s", validNonce)
	}

	invalidNonce := "invalid-nonce"
	// It's possible "invalid-nonce" actually works by luck, but very unlikely for Difficulty 8.
	// We'll check its work first.
	if CalculateWork(taskID, invalidNonce) < Difficulty {
		if VerifyEntropyReduction(taskID, invalidNonce) {
			t.Errorf("VerifyEntropyReduction passed for invalid nonce %s", invalidNonce)
		}
	}
}

func TestMineEntropyReduction(t *testing.T) {
	taskID := "mine-test"
	nonce := MineEntropyReduction(taskID)
	if nonce == "" {
		t.Fatal("MineEntropyReduction returned empty nonce")
	}

	if !VerifyEntropyReduction(taskID, nonce) {
		t.Errorf("MineEntropyReduction produced invalid nonce %s", nonce)
	}
}
