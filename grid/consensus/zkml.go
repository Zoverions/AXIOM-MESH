package consensus

import (
	"encoding/base64"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
)

// VerifyZKMLInference delegates the verification of a zkML proof to the ezkl library.
// It uses an artifact lifecycle cache for models and a deterministic Python worker for jobs.
func VerifyZKMLInference(commitment string, input []float64, output []float64, proof string, vk string, settings string) bool {
	log.Printf("Verifying zkML inference proof for model commitment: %s", commitment)

	if proof == "" || commitment == "" || vk == "" || settings == "" {
		return false
	}

	// Validate commitment string to prevent Path Traversal / Arbitrary File Write
	match, _ := regexp.MatchString("^[a-fA-F0-9]{64}$", commitment)
	if !match {
		log.Printf("Invalid model commitment format: %s", commitment)
		return false
	}

	// Model Artifact Lifecycle: Cache static vk and settings per model commitment.
	modelDir := filepath.Join("data", "zkml", "models", commitment)
	if err := os.MkdirAll(modelDir, 0755); err != nil {
		log.Printf("Failed to create model artifact directory: %v", err)
		return false
	}

	settingsPath := filepath.Join(modelDir, "settings.json")
	vkPath := filepath.Join(modelDir, "vk.key")

	// Atomically write model artifacts if they do not already exist to prevent race conditions
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		tempSettings, err := os.CreateTemp(modelDir, "settings.*.json.tmp")
		if err == nil {
			tempSettingsPath := tempSettings.Name()
			tempSettings.Write([]byte(settings))
			tempSettings.Close()
			if err := os.Rename(tempSettingsPath, settingsPath); err != nil {
				log.Printf("Failed to rename settings file: %v", err)
				os.Remove(tempSettingsPath)
			}
		} else {
			log.Printf("Failed to create temp settings file: %v", err)
			return false
		}
	}

	if _, err := os.Stat(vkPath); os.IsNotExist(err) {
		vkBytes, err := base64.StdEncoding.DecodeString(vk)
		if err != nil {
			log.Printf("Failed to decode vk base64: %v", err)
			return false
		}

		tempVk, err := os.CreateTemp(modelDir, "vk.*.key.tmp")
		if err == nil {
			tempVkPath := tempVk.Name()
			tempVk.Write(vkBytes)
			tempVk.Close()
			if err := os.Rename(tempVkPath, vkPath); err != nil {
				log.Printf("Failed to rename vk file: %v", err)
				os.Remove(tempVkPath)
			}
		} else {
			log.Printf("Failed to create temp vk file: %v", err)
			return false
		}
	}

	// Job Artifact Lifecycle: Ephemeral temp directory for concurrent proof evaluations
	jobDir, err := os.MkdirTemp("", "zkml_job_*")
	if err != nil {
		log.Printf("Failed to create job directory: %v", err)
		return false
	}
	defer os.RemoveAll(jobDir) // Safe cleanup of concurrent job artifacts

	proofPath := filepath.Join(jobDir, "proof.json")
	if err := os.WriteFile(proofPath, []byte(proof), 0644); err != nil {
		log.Printf("Failed to write proof file: %v", err)
		return false
	}

	// Deterministic Verification Worker flow: use a deterministic script
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

	scriptPath := filepath.Join(jobDir, "verify.py")
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
