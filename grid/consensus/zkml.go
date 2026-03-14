package consensus

import (
	"encoding/json"
	"log"
	"math/big"
)

// SCALE represents the scaling factor used in the Python prover
const SCALE = 10000

// ModelCommitmentPayload is the JSON structure for the Pedersen Commitments
type ModelCommitmentPayload struct {
	Cw []string `json:"C_w"`
	Cb string   `json:"C_b"`
}

// VerifyZKMLInference simulates a zkML verification process.
// In this implementation, it verifies a Homomorphic Pedersen Commitment
// of a linear model (dot product + bias) over the RFC 3526 MODP Group.
	"encoding/base64"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

// VerifyZKMLInference delegates the verification of a zkML proof to the ezkl library.
// It uses a Python script to call ezkl.verify on the provided proof, settings, and vk.
func VerifyZKMLInference(commitment string, input []float64, output []float64, proof string, vk string, settings string) bool {
	log.Printf("Verifying zkML inference proof for model commitment: %s", commitment)

	if proof == "" || commitment == "" || vk == "" || settings == "" {
		return false
	}

	tempDir, err := os.MkdirTemp("", "zkml_verify_*")
	if err != nil {
		log.Printf("Failed to create temp directory for zkML verification: %v", err)
		return false
	}
	defer os.RemoveAll(tempDir)

	proofPath := filepath.Join(tempDir, "proof.json")
	settingsPath := filepath.Join(tempDir, "settings.json")
	vkPath := filepath.Join(tempDir, "vk.key")

	if err := os.WriteFile(proofPath, []byte(proof), 0644); err != nil {
		log.Printf("Failed to write proof file: %v", err)
		return false
	}
	if err := os.WriteFile(settingsPath, []byte(settings), 0644); err != nil {
		log.Printf("Failed to write settings file: %v", err)
		return false
	}

	vkBytes, err := base64.StdEncoding.DecodeString(vk)
	if err != nil {
		log.Printf("Failed to decode vk base64: %v", err)
		return false
	}
	if err := os.WriteFile(vkPath, vkBytes, 0644); err != nil {
		log.Printf("Failed to write vk file: %v", err)
		return false
	}

	pyScript := `import ezkl
import sys

proof_path = sys.argv[1]
settings_path = sys.argv[2]
vk_path = sys.argv[3]

try:
    if ezkl.verify(proof_path, settings_path, vk_path):
        sys.exit(0)
    else:
        sys.exit(1)
except Exception as e:
    sys.exit(1)
`

	scriptPath := filepath.Join(tempDir, "verify.py")
	if err := os.WriteFile(scriptPath, []byte(pyScript), 0644); err != nil {
		log.Printf("Failed to write verification script: %v", err)
		return false
	}

	cmd := exec.Command("python3", scriptPath, proofPath, settingsPath, vkPath)
	err = cmd.Run()
	if err != nil {
		log.Printf("zkML verification failed: %v", err)
		return false
	}

	return true
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
	log.Printf("Verifying zkML inference proof...")

	if proof == "" || commitment == "" || len(output) == 0 {
		return false
	}

	var payload ModelCommitmentPayload
	if err := json.Unmarshal([]byte(commitment), &payload); err != nil {
		log.Printf("zkML verification failed: invalid commitment JSON")
		return false
	}

	if len(payload.Cw) != len(input) {
		log.Printf("zkML verification failed: commitment weight length mismatch")
		return false
	}
	if len(output) != 1 {
		log.Printf("zkML verification failed: output length should be 1")
		return false
	}

	// Safe Prime P (RFC 3526 1536-bit MODP Group)
	pHex := "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
	P, _ := new(big.Int).SetString(pHex, 16)
	Q := new(big.Int).Sub(P, big.NewInt(1))
	Q.Div(Q, big.NewInt(2))

	G := big.NewInt(2)
	H := big.NewInt(3)

	// Clean 0x prefixes
	cbHex := payload.Cb
	if len(cbHex) >= 2 && cbHex[:2] == "0x" {
		cbHex = cbHex[2:]
	}
	Cb, okCb := new(big.Int).SetString(cbHex, 16)
	if !okCb {
		log.Printf("zkML verification failed: invalid Cb hex")
		return false
	}

	proofHex := proof
	if len(proofHex) >= 2 && proofHex[:2] == "0x" {
		proofHex = proofHex[2:]
	}
	Ry, okRy := new(big.Int).SetString(proofHex, 16)
	if !okRy {
		log.Printf("zkML verification failed: invalid proof hex")
		return false
	}

	// Calculate Expected Commitment C_expected = C_b * prod(C_w_i ^ x_i_scaled) mod P
	C_expected := new(big.Int).Set(Cb)

	for i, xi := range input {
		cwHex := payload.Cw[i]
		if len(cwHex) >= 2 && cwHex[:2] == "0x" {
			cwHex = cwHex[2:]
		}
		Cwi, okCwi := new(big.Int).SetString(cwHex, 16)
		if !okCwi {
			log.Printf("zkML verification failed: invalid Cwi hex")
			return false
		}

		// Scale the input Float to Int (just like the prover)
		xScaledFloat := xi * SCALE
		var xScaled int64
		if xScaledFloat < 0 {
			xScaled = int64(xScaledFloat - 0.5) // round
		} else {
			xScaled = int64(xScaledFloat + 0.5) // round
		}

		// Modulo Q for negative handling
		xScaledBig := big.NewInt(xScaled)
		xScaledBig.Mod(xScaledBig, Q)

		// Cwi ^ xScaledBig mod P
		term := new(big.Int).Exp(Cwi, xScaledBig, P)
		C_expected.Mul(C_expected, term)
		C_expected.Mod(C_expected, P)
	}

	// Reconstruct Actual Commitment C_actual = G ^ y_scaled * H ^ r_y mod P
	y := output[0]
	// y is effectively scaled by SCALE^2 because w and x were both scaled by SCALE.
	yScaledFloat := y * float64(SCALE*SCALE)
	var yScaled int64
	if yScaledFloat < 0 {
		yScaled = int64(yScaledFloat - 0.5) // round
	} else {
		yScaled = int64(yScaledFloat + 0.5) // round
	}

	yScaledBig := big.NewInt(yScaled)
	yScaledBig.Mod(yScaledBig, Q)

	gPowY := new(big.Int).Exp(G, yScaledBig, P)
	hPowRy := new(big.Int).Exp(H, Ry, P)
	C_actual := new(big.Int).Mul(gPowY, hPowRy)
	C_actual.Mod(C_actual, P)

	// Verify equality
	valid := C_expected.Cmp(C_actual) == 0
	if !valid {
		log.Printf("zkML verification failed: commitment mismatch")
	} else {
		log.Printf("zkML verification successful!")
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
