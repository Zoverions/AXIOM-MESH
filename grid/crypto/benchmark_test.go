package crypto

import (
	"crypto/sha256"
	"testing"
	"github.com/ethereum/go-ethereum/crypto"
)

// BenchmarkClassicalSignature benchmarks the classical ECDSA signature generation.
func BenchmarkClassicalSignature(b *testing.B) {
	privKey, err := crypto.GenerateKey()
	if err != nil {
		b.Fatalf("Failed to generate key: %v", err)
	}
	msg := []byte("benchmark test message")
	hash := sha256.Sum256(msg)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := crypto.Sign(hash[:], privKey)
		if err != nil {
			b.Fatalf("Failed to sign: %v", err)
		}
	}
}

// BenchmarkClassicalVerification benchmarks the classical ECDSA signature verification.
func BenchmarkClassicalVerification(b *testing.B) {
	privKey, err := crypto.GenerateKey()
	if err != nil {
		b.Fatalf("Failed to generate key: %v", err)
	}
	msg := []byte("benchmark test message")
	hash := sha256.Sum256(msg)
	sig, err := crypto.Sign(hash[:], privKey)
	if err != nil {
		b.Fatalf("Failed to sign: %v", err)
	}

	// For verification, we need the public key bytes
	pubKeyBytes := crypto.FromECDSAPub(&privKey.PublicKey)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// ecdsa.Verify is standard, or crypto.VerifySignature
		// Remove recovery ID from signature for VerifySignature (last byte)
		valid := crypto.VerifySignature(pubKeyBytes, hash[:], sig[:len(sig)-1])
		if !valid {
			b.Fatalf("Failed to verify signature")
		}
	}
}

// EFF-A.1 Benchmark Hybrid Crypto Overhead (Classical + PQ mock overhead)
func BenchmarkEFF_A_1_HybridSignatureSimulated(b *testing.B) {
	privKey, err := crypto.GenerateKey()
	if err != nil {
		b.Fatalf("Failed to generate key: %v", err)
	}
	msg := []byte("benchmark test message")
	hash := sha256.Sum256(msg)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := crypto.Sign(hash[:], privKey)
		if err != nil {
			b.Fatalf("Failed to sign: %v", err)
		}
		// Simulate PQ signature generation overhead
		var dummy [32]byte
		for j := 0; j < 5; j++ {
			dummy = sha256.Sum256(dummy[:])
		}
	}
}

// BenchmarkEFF_A_1_HybridVerificationSimulated simulates hybrid verification overhead
func BenchmarkEFF_A_1_HybridVerificationSimulated(b *testing.B) {
	privKey, err := crypto.GenerateKey()
	if err != nil {
		b.Fatalf("Failed to generate key: %v", err)
	}
	msg := []byte("benchmark test message")
	hash := sha256.Sum256(msg)
	sig, err := crypto.Sign(hash[:], privKey)
	if err != nil {
		b.Fatalf("Failed to sign: %v", err)
	}
	pubKeyBytes := crypto.FromECDSAPub(&privKey.PublicKey)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		valid := crypto.VerifySignature(pubKeyBytes, hash[:], sig[:len(sig)-1])
		if !valid {
			b.Fatalf("Failed to verify signature")
		}
		// Simulate PQ signature verification overhead
		var dummy [32]byte
		for j := 0; j < 3; j++ {
			dummy = sha256.Sum256(dummy[:])
		}
	}
}
