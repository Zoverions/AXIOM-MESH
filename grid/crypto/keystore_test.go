package crypto

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrGenerateKey(t *testing.T) {
	// Create a temporary directory for the keystore
	dirPath, err := os.MkdirTemp("", "keystore_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(dirPath) // Clean up

	// 1. Generate a new key
	privKey1, err := LoadOrGenerateKey(dirPath)
	if err != nil {
		t.Fatalf("Failed to generate new key: %v", err)
	}
	if privKey1 == nil {
		t.Fatal("Expected generated key to be non-nil")
	}

	// Verify the key file was created and has correct permissions
	keyPath := filepath.Join(dirPath, "key")
	info, err := os.Stat(keyPath)
	if err != nil {
		t.Fatalf("Failed to stat key file: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("Expected key file permissions to be 0600, got %v", info.Mode().Perm())
	}

	// 2. Load the existing key
	privKey2, err := LoadOrGenerateKey(dirPath)
	if err != nil {
		t.Fatalf("Failed to load existing key: %v", err)
	}
	if privKey2 == nil {
		t.Fatal("Expected loaded key to be non-nil")
	}

	// 3. Verify keys match
	if privKey1.D.Cmp(privKey2.D) != 0 {
		t.Errorf("Loaded key does not match generated key")
	}
	if privKey1.PublicKey.X.Cmp(privKey2.PublicKey.X) != 0 || privKey1.PublicKey.Y.Cmp(privKey2.PublicKey.Y) != 0 {
		t.Errorf("Loaded public key does not match generated public key")
	}
}

func TestLoadOrGenerateKey_ErrorMkdir(t *testing.T) {
	// Create a file instead of a directory to force an error in MkdirAll
	tempFile, err := os.CreateTemp("", "keystore_file")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	defer os.Remove(tempFile.Name())

	// Attempt to use the file as a directory path
	_, err = LoadOrGenerateKey(tempFile.Name())
	if err == nil {
		t.Fatal("Expected error when providing a file path instead of a directory, got nil")
	}
}
