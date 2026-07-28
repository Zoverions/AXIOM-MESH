package consensus

import (
	"os"
	"path/filepath"
	"testing"
)

// setupMockPython creates a temporary directory with a mock python3 executable that
// simply exits with the code specified in the MOCK_PYTHON_EXIT_CODE environment variable.
// It prepends this directory to the PATH for the duration of the test.
func setupMockPython(t *testing.T) string {
	tempDir := t.TempDir()
	mockPythonPath := filepath.Join(tempDir, "python3")

	// Create a mock python3 executable (shell script)
	// Make sure it reads the env variable even if Env is cleared by passing it or writing it to a file
	// Since cmd.Env = []string{} clears all env vars, we can't use MOCK_PYTHON_EXIT_CODE
	// Instead, let's read from a file in the temp dir
	mockPythonScript := `#!/bin/sh
if [ -f "` + tempDir + `/exit_code" ]; then
    exit $(cat "` + tempDir + `/exit_code")
fi
exit 0
`
	err := os.WriteFile(mockPythonPath, []byte(mockPythonScript), 0755)
	if err != nil {
		t.Fatalf("Failed to write mock python3 script: %v", err)
	}

	// Prepend the temp dir to the PATH using t.Setenv
	originalPath := os.Getenv("PATH")
	newPath := tempDir + string(os.PathListSeparator) + originalPath
	t.Setenv("PATH", newPath)
	return tempDir
}

func TestVerifyZKMLInference_EmptyInputs(t *testing.T) {
	// Test that empty strings in required fields return false
	cases := []struct {
		name       string
		commitment string
		proof      string
		vk         string
		settings   string
	}{
		{"Empty Proof", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", "", "vk", "settings"},
		{"Empty Commitment", "", "proof", "vk", "settings"},
		{"Empty VK", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", "proof", "", "settings"},
		{"Empty Settings", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", "proof", "vk", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := VerifyZKMLInference(tc.commitment, []float64{1.0}, []float64{2.0}, tc.proof, tc.vk, tc.settings)
			if result != false {
				t.Errorf("Expected VerifyZKMLInference to return false for %s, got true", tc.name)
			}
		})
	}
}

func TestVerifyZKMLInference_InvalidVKBase64(t *testing.T) {
	// 64-character valid hex commitment
	commitment := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	invalidVK := "invalid-base64-!@#"

	result := VerifyZKMLInference(commitment, []float64{1.0}, []float64{2.0}, "proof", invalidVK, "settings")
	if result != false {
		t.Errorf("Expected VerifyZKMLInference to return false for invalid VK base64, got true")
	}
}

func TestVerifyZKMLInference_InvalidCommitment(t *testing.T) {
	cases := []struct {
		name       string
		commitment string
	}{
		{"Too Short", "a1b2c3d4e5f6a1b2"},
		{"Too Long", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"},
		{"Invalid Chars", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1xx"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := VerifyZKMLInference(tc.commitment, []float64{1.0}, []float64{2.0}, "proof", "vk", "settings")
			if result != false {
				t.Errorf("Expected VerifyZKMLInference to return false for %s, got true", tc.name)
			}
		})
	}
}

func TestVerifyZKMLInference_Success(t *testing.T) {
	tempDir := setupMockPython(t)

	// Ensure our mock Python exits with 0 (success)
	os.WriteFile(filepath.Join(tempDir, "exit_code"), []byte("0"), 0644)

	// 64-character valid hex commitment
	commitment := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

	// Clean up created files in data/zkml/models regardless of test outcome
	t.Cleanup(func() {
		os.RemoveAll(filepath.Join("data", "zkml", "models", commitment))
	})

	proof := "mock-proof-data"
	// Base64 encoded dummy data
	vk := "ZHVtbXlfdms=" // "dummy_vk"
	settings := `{"dummy": "settings"}`

	// Execute Verification
	result := VerifyZKMLInference(commitment, []float64{1.0}, []float64{2.0}, proof, vk, settings)
	if result != true {
		t.Errorf("Expected VerifyZKMLInference to return true on successful mock execution, got false")
	}

	// Verify Cache Hit: If we change the mock python to fail but don't change inputs, it should still return true
	os.WriteFile(filepath.Join(tempDir, "exit_code"), []byte("1"), 0644)
	cachedResult := VerifyZKMLInference(commitment, []float64{1.0}, []float64{2.0}, proof, vk, settings)
	if cachedResult != true {
		t.Errorf("Expected VerifyZKMLInference to return true from cache on subsequent call, got false")
	}
}

func TestVerifyZKMLInference_PythonFails(t *testing.T) {
	tempDir := setupMockPython(t)

	// Ensure our mock Python exits with 1 (failure)
	os.WriteFile(filepath.Join(tempDir, "exit_code"), []byte("1"), 0644)

	// 64-character valid hex commitment
	commitment := "f1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

	// Clean up created files in data/zkml/models regardless of test outcome
	t.Cleanup(func() {
		os.RemoveAll(filepath.Join("data", "zkml", "models", commitment))
	})

	proof := "mock-proof-data-failure"
	vk := "ZHVtbXlfdms="
	settings := `{"dummy": "settings"}`

	result := VerifyZKMLInference(commitment, []float64{1.0}, []float64{2.0}, proof, vk, settings)
	if result != false {
		t.Errorf("Expected VerifyZKMLInference to return false on Python script failure, got true")
	}
}

func TestVerifyZKMLInferencePathTraversal(t *testing.T) {
	proofStr := `{"C_w":["0xfa6f8ab2477347f08da695bf0791c5072fa4b0c47575b43c476835a21387e9bd3da43df4f8c0e4fcda44ab436a1cf1687d5446072cd3b62c4698907bf50fdca5d356cb188b989db83802c4eae61d05ceb8e07874c76b8207bd1d717b4e84487fa2392821d56c40ab623a86e20036ee782e30a825acb30747a9561b09b3dc76e3be5687292dec6458f404840c1a4635def290f398e337289c98202a9a383e4336f1fae2ee82d46daf84045cc7fd4dab37377dcd8d2190dd390512975d918ae88bf5bf0d45729683b618d49077d2c1b69a74629912dab962e2af3bc2d1ac0dcde8902aa752ff09fa8e0f1c5bcea12fe6bf8a92f7540b93770c63568035d0cc0609","0xc41163e1a7568b9e57f03d78f2c322a9f34cd7d9b65916ad09aff8c3fdbe897ed0aebf2e8b50ad02a3ec02cbf10ca7ce396a5a117ffff6df9a938bf8a7b72842f5a4dc6714d58b5ed5c40543b5dd961d9987acb3e41d0dbf30e7c7954e5a614dd8190a4311bedbca230692e44711f8247fcc68801849c9ba318e80a9b0b586ee1d1a28cf8bc081e76f6b2191f41e8b2b1f55bb1785a5104ad877919a52d3c0690e71d3c94b2d7a46520ea9f5b88ecffb2459d64d3d991fe982347b3eb053e200adb13ff2883ae528c3a54921c392441e9509d2fd8f5f48555f9a9e60b1b3f1de8300a6b724894471a31265aca3d24a540035e62a1bd8d099dbc3f1d8005ff5b8","0x1f046b7aa5aa4380dac8914b5fff6f08c7647c8c40c72137106fd5405f41ce03a8a74df0214d8e9c4b0e281c82c80273668333815890f68f3f40e43872e7df420e016264cdc8f3fb8d7386549d5d22077c2b120b2fb304b7eca4b0f16f02169599c3da45bcacaaeff3bd679db9ced6bbdafc4da7a831a75b4ada33d68241d8e60c07827a571f5c2795b206c604b8b5674bee65e3c5a7fc5740cc4d7c2d440865e67bc98ac65ac67a29e4a8018f9efeaa4dc4723434bff19246591dd30cf6a4d1aecaf2c6bf1354bdb9234687cfc9311f56dc156b3213b1ccf2cacca9f46175b3f8bbc8ceab41184441eecda2cdd9d44cac5c65c32eed347b155579a4a788cbcb","0x36350ae13c3c88b0173ad67e324a600bef0ebb3df082a43c50095062dc7f78dcf242cdb61f4014ce590b7e6fb93e1adf3a18f6ac5fba3388d503afb29cb0a9053c8b543f1f3041a061abc748476043c857d05399451b51d162a36182808f9f872511f39655052e7ffa402b536b40b9ac4b05c29ed2ddc63236a9309ea5bcec937af1914fdf4012eee44f7e8496ab45d61c68196249b48f0909694d4e1c1455fd83bb6f25f916e6b91ccabfc3f521a0ac7ceee899b051451e823e9e39dde6f95789710df1d65a36f2b00e66d80f8b57ea874410964e5176c2b443e7245bacf1dbacce0f464a918a2eb8cc345fa3653c3cc1777bbb7667664c1d5eb338ff43e63"],"C_b":"0x1"}`

	resInvalid := VerifyZKMLInference("../../../../etc/passwd", []float64{1.0}, []float64{-0.7}, proofStr, "dummy", "dummy")
	if resInvalid != false {
		t.Errorf("VerifyZKMLInference failed to block path traversal attempt")
	}
}

func TestVerifyZKMLInference_MkdirAllFails(t *testing.T) {
	commitment := "b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	modelDir := filepath.Join("data", "zkml", "models", commitment)

	// Create a regular file where the directory should be
	os.MkdirAll(filepath.Dir(modelDir), 0755)
	os.WriteFile(modelDir, []byte("not a directory"), 0644)
	defer os.Remove(modelDir)

	result := VerifyZKMLInference(commitment, []float64{1.0}, []float64{2.0}, "proof", "ZHVtbXlfdms=", "settings")
	if result != false {
		t.Errorf("Expected VerifyZKMLInference to return false when MkdirAll fails")
	}
}

func TestVerifyZKMLInference_CreateTempSettingsFails(t *testing.T) {
	commitment := "c1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	modelDir := filepath.Join("data", "zkml", "models", commitment)

	os.MkdirAll(modelDir, 0755)

	// Make directory read-only so CreateTemp fails
	os.Chmod(modelDir, 0555)
	defer os.Chmod(modelDir, 0755)
	defer os.RemoveAll(modelDir)

	result := VerifyZKMLInference(commitment, []float64{1.0}, []float64{2.0}, "proof", "ZHVtbXlfdms=", "settings")
	if result != false {
		t.Errorf("Expected VerifyZKMLInference to return false when CreateTemp for settings fails")
	}
}

func TestVerifyZKMLInference_CreateTempVkFails(t *testing.T) {
	commitment := "e1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	modelDir := filepath.Join("data", "zkml", "models", commitment)

	os.MkdirAll(modelDir, 0755)
	defer func() {
		os.Chmod(modelDir, 0755)
		os.RemoveAll(modelDir)
	}()

	// Create settings.json so it skips settings creation
	settingsPath := filepath.Join(modelDir, "settings.json")
	os.WriteFile(settingsPath, []byte("{}"), 0644)

	// Make directory read-only so CreateTemp for vk fails
	os.Chmod(modelDir, 0555)

	result := VerifyZKMLInference(commitment, []float64{1.0}, []float64{2.0}, "proof", "ZHVtbXlfdms=", "settings")
	if result != false {
		t.Errorf("Expected VerifyZKMLInference to return false when CreateTemp for vk fails")
	}
}
