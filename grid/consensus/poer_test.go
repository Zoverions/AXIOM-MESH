package consensus

import (
	"testing"
)

func TestCalculatePoERScore(t *testing.T) {
	taskID := "test-task"

	// We'll find a few nonces manually or via Mine to test CalculatePoERScore
	nonce1 := MineEntropyReduction(taskID)
	work1 := CalculatePoERScore(taskID, nonce1)
	if work1 < Difficulty {
		t.Errorf("MineEntropyReduction produced nonce with score %d, expected at least %d", work1, Difficulty)
	}

	// Test with a nonce we know has 0 work (unlikely but possible to have leading zeros,
	// so we check if it's less than something large)
	nonceZero := "something-unlikely-to-have-leading-zeros"
	workZero := CalculatePoERScore(taskID, nonceZero)
	if workZero >= 256 {
		t.Errorf("CalculatePoERScore produced impossible score %d", workZero)
	}
}

func TestMineEntropyReduction(t *testing.T) {
	taskID := "mine-test"
	nonce := MineEntropyReduction(taskID)
	if nonce == "" {
		t.Fatal("MineEntropyReduction returned empty nonce")
	}

	if CalculatePoERScore(taskID, nonce) < Difficulty {
		t.Errorf("MineEntropyReduction produced invalid nonce %s", nonce)
	}
}

func TestCalculatePoERScoreVectors(t *testing.T) {
	vectors := []struct {
		taskID   string
		nonce    string
		expected int
	}{
		{"hello", "1", 0},
		{"hello", "2", 0},
		{"world", "123", 2},
		{"test-task", "0", 1},
		{"test-task", "1", 0},
		{"axiom", "42", 0},
		{"mesh", "999", 2},
		{"hello", "227", 11},
		{"world", "38", 8},
		{"test-task", "195", 10},
		{"axiom", "496", 8},
		{"mesh", "416", 8},
	}

	for _, v := range vectors {
		score := CalculatePoERScore(v.taskID, v.nonce)
		if score != v.expected {
			t.Errorf("CalculatePoERScore(%q, %q) = %d; expected %d", v.taskID, v.nonce, score, v.expected)
		}
	}
}

func TestCalculateAttentionWeightedScore(t *testing.T) {
	cases := []struct {
		base              float64
		attentionWeight   float64
		priorReliability  float64
		expected          float64
	}{
		{100.0, 1.0, 1.0, 100.0},
		{100.0, 0.0, 1.0, 0.0}, // No relevance
		{100.0, 1.0, 0.0, 50.0}, // Zero prior reliability cuts score in half
		{100.0, 0.5, 0.5, 37.5}, // 100 * 0.5 * 0.75
	}

	for _, tc := range cases {
		result := CalculateAttentionWeightedScore(tc.base, tc.attentionWeight, tc.priorReliability)
		if result != tc.expected {
			t.Errorf("CalculateAttentionWeightedScore(%f, %f, %f) = %f; want %f",
				tc.base, tc.attentionWeight, tc.priorReliability, result, tc.expected)
		}
	}
}
