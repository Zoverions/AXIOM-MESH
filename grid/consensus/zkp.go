package consensus

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
)

type ZKProof struct {
	Y string `json:"y"`
	T string `json:"t"`
	R string `json:"r"`
}

// VerifyGraphQueryProof verifies a Non-Interactive Zero-Knowledge Proof (NIZK) of a discrete logarithm.
// This proves the sender holds a secret associated with their public key, using the Fiat-Shamir heuristic,
// over the RFC 3526 1536-bit MODP Group safe prime.
func VerifyGraphQueryProof(query string, proof string) bool {
	log.Printf("Verifying ZKP for query: %s", query)

	if proof == "" {
		return false
	}

	var p ZKProof
	if err := json.Unmarshal([]byte(proof), &p); err != nil {
		log.Printf("ZKP verification failed: invalid JSON proof")
		return false
	}

	// Remove 0x prefixes if present
	yHex := p.Y
	tHex := p.T
	rHex := p.R
	if len(yHex) >= 2 && yHex[:2] == "0x" { yHex = yHex[2:] }
	if len(tHex) >= 2 && tHex[:2] == "0x" { tHex = tHex[2:] }
	if len(rHex) >= 2 && rHex[:2] == "0x" { rHex = rHex[2:] }

	y, okY := new(big.Int).SetString(yHex, 16)
	t, okT := new(big.Int).SetString(tHex, 16)
	r, okR := new(big.Int).SetString(rHex, 16)

	if !okY || !okT || !okR {
		log.Printf("ZKP verification failed: invalid hex values")
		return false
	}

	// Safe Prime P (RFC 3526 1536-bit MODP Group)
	pHex := "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
	P, _ := new(big.Int).SetString(pHex, 16)
	Q := new(big.Int).Sub(P, big.NewInt(1))
	Q.Div(Q, big.NewInt(2))
	G := big.NewInt(2)

	// Compute challenge c = Hash(y || t || query) mod Q
	hasher := sha256.New()
	hasher.Write([]byte(y.String()))
	hasher.Write([]byte(t.String()))
	hasher.Write([]byte(query))

	hashBytes := hasher.Sum(nil)
	hashHex := hex.EncodeToString(hashBytes)

	c, _ := new(big.Int).SetString(hashHex, 16)
	c.Mod(c, Q)

	// Verify t == (G^r * y^c) mod P
	left := new(big.Int).Exp(G, r, P)
	right := new(big.Int).Exp(y, c, P)
	left.Mul(left, right)
	left.Mod(left, P)

	valid := left.Cmp(t) == 0
	if !valid {
		log.Printf("ZKP verification failed: invalid proof components")
	}

	return valid
}

// GenerateGraphQueryProof generates a Non-Interactive Zero-Knowledge Proof (NIZK)
// of a discrete logarithm over the RFC 3526 1536-bit MODP Group safe prime.
// It proves knowledge of secret 'x' such that y = G^x mod P.
func GenerateGraphQueryProof(query string, secretHex string) (string, error) {
	pHex := "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
	P, _ := new(big.Int).SetString(pHex, 16)
	Q := new(big.Int).Sub(P, big.NewInt(1))
	Q.Div(Q, big.NewInt(2))
	G := big.NewInt(2)

	// x is the secret
	x, ok := new(big.Int).SetString(secretHex, 16)
	if !ok {
		return "", fmt.Errorf("invalid secret hex")
	}

	// y = G^x mod P
	y := new(big.Int).Exp(G, x, P)

	// Generate secure random nonce v in [1, Q-1]
	v, err := rand.Int(rand.Reader, Q)
	if err != nil {
		return "", fmt.Errorf("failed to generate random nonce: %w", err)
	}

	// t = G^v mod P
	t := new(big.Int).Exp(G, v, P)

	// c = Hash(y || t || query) mod Q
	hasher := sha256.New()
	hasher.Write([]byte(y.String()))
	hasher.Write([]byte(t.String()))
	hasher.Write([]byte(query))
	hashBytes := hasher.Sum(nil)
	hashHex := hex.EncodeToString(hashBytes)
	c, _ := new(big.Int).SetString(hashHex, 16)
	c.Mod(c, Q)

	// r = v - c * x mod Q
	cx := new(big.Int).Mul(c, x)
	r := new(big.Int).Sub(v, cx)
	r.Mod(r, Q)
	// Make r positive
	if r.Sign() < 0 {
		r.Add(r, Q)
	}

	proof := ZKProof{
		Y: y.Text(16),
		T: t.Text(16),
		R: r.Text(16),
	}

	proofBytes, err := json.Marshal(proof)
	if err != nil {
		return "", err
	}
	return string(proofBytes), nil
}
