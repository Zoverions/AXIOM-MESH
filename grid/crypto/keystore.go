package crypto

import (
	"crypto/ecdsa"
	"fmt"
	"os"
	"path/filepath"

	"github.com/ethereum/go-ethereum/crypto"
)

func LoadOrGenerateKey(dirPath string) (*ecdsa.PrivateKey, error) {
	err := os.MkdirAll(dirPath, 0700)
	if err != nil {
		return nil, fmt.Errorf("failed to create keystore directory: %w", err)
	}

	keyPath := filepath.Join(dirPath, "key")

	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		// Generate new key
		priv, err := crypto.GenerateKey()
		if err != nil {
			return nil, fmt.Errorf("failed to generate key: %w", err)
		}

		err = crypto.SaveECDSA(keyPath, priv)
		if err != nil {
			return nil, fmt.Errorf("failed to save key: %w", err)
		}
		// Ensure correct permissions
		if err := os.Chmod(keyPath, 0600); err != nil {
			return nil, fmt.Errorf("failed to set key permissions: %w", err)
		}

		return priv, nil
	}

	// Load existing key
	return crypto.LoadECDSA(keyPath)
}
