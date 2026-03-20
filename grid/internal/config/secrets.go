package config

import (
	"os"
)

func GetSecret(secretName, defaultVal string) string {
	provider := os.Getenv("SECRET_PROVIDER")
	if provider == "" {
		provider = "env"
	}

	if provider == "aws" {
		val := getAwsSecret(secretName)
		if val != "" {
			return val
		}
	} else if provider == "vault" {
		val := getVaultSecret(secretName)
		if val != "" {
			return val
		}
	}

	val := os.Getenv(secretName)
	if val != "" {
		return val
	}
	return defaultVal
}

func getAwsSecret(secretName string) string {
	// AWS SDK logic would go here
	return ""
}

func getVaultSecret(secretName string) string {
	// Vault logic would go here
	return ""
}
