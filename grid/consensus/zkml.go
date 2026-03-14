package consensus

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	"math/big"
)

type ZKMLProof struct {
	CW []string `json:"C_w"`
	CB string   `json:"C_b"`
}

// VerifyZKMLInference cryptographically verifies the computational integrity of a linear ML model pass.
// It verifies that the edge node executed the exact weights/bias without revealing them.
func VerifyZKMLInference(commitment string, input []float64, output []float64, proof string) bool {
	log.Printf("Verifying zkML inference proof for model commitment: %s", commitment)

	if proof == "" || commitment == "" || len(output) == 0 {
		return false
	}

	// 1. Verify the proof payload hashes to the model commitment
	hasher := sha256.New()
	hasher.Write([]byte(proof))
	if hex.EncodeToString(hasher.Sum(nil)) != commitment {
		log.Printf("zkML verification failed: proof payload does not match model commitment")
		return false
	}

	// 2. Unmarshal the Homomorphic Commitments
	var p ZKMLProof
	if err := json.Unmarshal([]byte(proof), &p); err != nil {
		log.Printf("zkML verification failed: invalid JSON proof")
		return false
	}

	if len(p.CW) != len(input) {
		log.Printf("zkML verification failed: input dimensions do not match model commitments")
		return false
	}

	// Safe Prime P (RFC 3526 1536-bit MODP Group)
	pHex := "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
	P, _ := new(big.Int).SetString(pHex, 16)
	Q := new(big.Int).Sub(P, big.NewInt(1))
	Q.Div(Q, big.NewInt(2))
	G := big.NewInt(2)

	SCALE := float64(10000)

	// 3. Evaluate the Homomorphic Linear Operation
	// LHS = prod( C_w[i] ^ x_int[i] ) * ( C_b ^ SCALE ) mod P
	lhs := big.NewInt(1)
	for i, x := range input {
		cwHex := p.CW[i]
		if len(cwHex) >= 2 && cwHex[:2] == "0x" {
			cwHex = cwHex[2:]
		}
		cw, ok := new(big.Int).SetString(cwHex, 16)
		if !ok {
			return false
		}

		xIntFloat := math.Round(x * SCALE)
		xInt := big.NewInt(int64(xIntFloat))
		xInt.Mod(xInt, Q) // Handle negative input values properly via modulo Q

		term := new(big.Int).Exp(cw, xInt, P)
		lhs.Mul(lhs, term)
		lhs.Mod(lhs, P)
	}

	cbHex := p.CB
	if len(cbHex) >= 2 && cbHex[:2] == "0x" {
		cbHex = cbHex[2:]
	}
	cb, ok := new(big.Int).SetString(cbHex, 16)
	if !ok {
		return false
	}

	scaleInt := big.NewInt(int64(SCALE))
	biasTerm := new(big.Int).Exp(cb, scaleInt, P)
	lhs.Mul(lhs, biasTerm)
	lhs.Mod(lhs, P)

	// 4. Check against the Output
	// RHS = G ^ y_int mod P
	yIntFloat := math.Round(output[0] * SCALE * SCALE)
	yInt := big.NewInt(int64(yIntFloat))
	yInt.Mod(yInt, Q) // Handle negative outputs properly via modulo Q

	rhs := new(big.Int).Exp(G, yInt, P)

	valid := lhs.Cmp(rhs) == 0
	if !valid {
		log.Printf("zkML verification failed: computational mismatch, edge node cheated!")
	}
	return valid
}
