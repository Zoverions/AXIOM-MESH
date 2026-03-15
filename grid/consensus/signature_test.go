package consensus

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/hex"
	"testing"
)

func TestSignature(t *testing.T) {
	// Generate a key pair
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	pubBytes := elliptic.Marshal(elliptic.P256(), priv.PublicKey.X, priv.PublicKey.Y)
	pubHex := hex.EncodeToString(pubBytes)

	data := []byte("hello world")

	// Test SignData
	sigHex, err := SignData(priv, data)
	if err != nil {
		t.Fatalf("SignData failed: %v", err)
	}

	// Test VerifySignature happy path
	if !VerifySignature(pubHex, data, sigHex) {
		t.Error("VerifySignature failed for valid signature")
	}

	// Test VerifySignature with tampered data
	tamperedData := []byte("hello worlc")
	if VerifySignature(pubHex, tamperedData, sigHex) {
		t.Error("VerifySignature succeeded for tampered data")
	}

	// Test VerifySignature with tampered signature
	sigBytes, _ := hex.DecodeString(sigHex)
	sigBytes[0] ^= 0xFF
	tamperedSigHex := hex.EncodeToString(sigBytes)
	if VerifySignature(pubHex, data, tamperedSigHex) {
		t.Error("VerifySignature succeeded for tampered signature")
	}

	// Test VerifySignature with invalid public key
	if VerifySignature("invalid-hex", data, sigHex) {
		t.Error("VerifySignature succeeded for invalid public key hex")
	}
	if VerifySignature(hex.EncodeToString([]byte("too short")), data, sigHex) {
		t.Error("VerifySignature succeeded for invalid public key format")
	}

	// Test VerifySignature with invalid signature
	if VerifySignature(pubHex, data, "invalid-hex") {
		t.Error("VerifySignature succeeded for invalid signature hex")
	}
	if VerifySignature(pubHex, data, hex.EncodeToString(make([]byte, 63))) {
		t.Error("VerifySignature succeeded for invalid signature length")
	}
}

func TestSignatureConsistency(t *testing.T) {
	// Run multiple times to catch cases where r or s might be less than 32 bytes
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	pubBytes := elliptic.Marshal(elliptic.P256(), priv.PublicKey.X, priv.PublicKey.Y)
	pubHex := hex.EncodeToString(pubBytes)
	data := []byte("consistent test")

	for i := 0; i < 1000; i++ {
		sigHex, err := SignData(priv, data)
		if err != nil {
			t.Fatalf("SignData failed at iteration %d: %v", i, err)
		}
		if len(sigHex) != 128 {
			t.Errorf("Iteration %d: sigHex length is %d, expected 128 (64 bytes)", i, len(sigHex))
		}
		if !VerifySignature(pubHex, data, sigHex) {
			t.Errorf("Iteration %d: VerifySignature failed", i)
		}
	}
}
