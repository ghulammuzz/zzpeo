package config

import (
	"encoding/hex"
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	DatabaseURL string
	SecretKey   []byte // 32 raw bytes decoded from APP_SECRET_KEY hex string
	APIPort     string
}

// Load reads a .env file (if present) then environment variables, validates
// required values, and returns a populated Config.
func Load() (*Config, error) {
	// Attempt to load a .env file; not fatal if it doesn't exist.
	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required but not set")
	}

	secretHex := os.Getenv("APP_SECRET_KEY")
	if secretHex == "" {
		return nil, fmt.Errorf("config: APP_SECRET_KEY is required but not set")
	}

	secretBytes, err := hex.DecodeString(secretHex)
	if err != nil {
		return nil, fmt.Errorf("config: APP_SECRET_KEY is not valid hex: %w", err)
	}

	if len(secretBytes) != 32 {
		return nil, fmt.Errorf(
			"config: APP_SECRET_KEY must decode to exactly 32 bytes (got %d); "+
				"generate one with: openssl rand -hex 32",
			len(secretBytes),
		)
	}

	apiPort := os.Getenv("API_PORT")
	if apiPort == "" {
		apiPort = "8080"
	}

	return &Config{
		DatabaseURL: databaseURL,
		SecretKey:   secretBytes,
		APIPort:     apiPort,
	}, nil
}
