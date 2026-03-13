package consensus

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
)

// SignData signs arbitrary data using the provided ECDSA private key.
func SignData(priv *ecdsa.PrivateKey, data []byte) (string, error) {
	hash := sha256.Sum256(data)
	r, s, err := ecdsa.Sign(rand.Reader, priv, hash[:])
	if err != nil {
		return "", err
	}
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	sigBytes := append(rBytes, sBytes...)
	return hex.EncodeToString(sigBytes), nil
}

// VerifySignature verifies the signature of the given data using the hex-encoded public key.
func VerifySignature(pubHex string, data []byte, sigHex string) bool {
	pubBytes, err := hex.DecodeString(pubHex)
	if err != nil {
		return false
	}
	x, y := elliptic.Unmarshal(elliptic.P256(), pubBytes)
	if x == nil {
		return false
	}
	pub := &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}

	sigBytes, err := hex.DecodeString(sigHex)
	if err != nil || len(sigBytes) != 64 {
		return false
	}

	r := new(big.Int).SetBytes(sigBytes[:32])
	s := new(big.Int).SetBytes(sigBytes[32:])

	hash := sha256.Sum256(data)
	return ecdsa.Verify(pub, hash[:], r, s)
}
