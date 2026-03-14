package consensus

import (
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
}
