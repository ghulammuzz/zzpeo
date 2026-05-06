package ssh

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"

	"github.com/google/uuid"
	"golang.org/x/crypto/hkdf"
)

// KeyStore holds the master AES-256 key and provides per-record encryption
// using HKDF-derived keys.
type KeyStore struct {
	masterKey []byte // 32 bytes
}

// NewKeyStore creates a KeyStore from a 64-character hex-encoded 32-byte key.
func NewKeyStore(hexKey string) (*KeyStore, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("invalid hex key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("key must be 32 bytes, got %d", len(key))
	}
	return &KeyStore{masterKey: key}, nil
}

// NewKeyStoreFromBytes creates a KeyStore from a raw 32-byte slice.
func NewKeyStoreFromBytes(key []byte) (*KeyStore, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("key must be 32 bytes, got %d", len(key))
	}
	cp := make([]byte, 32)
	copy(cp, key)
	return &KeyStore{masterKey: cp}, nil
}

// deriveKey uses HKDF-SHA256 to derive a per-record 32-byte AES key.
// The recordID is used as the HKDF salt so each record gets a unique key.
func (ks *KeyStore) deriveKey(recordID uuid.UUID) ([]byte, error) {
	info := []byte("zzpeo-ssh-key")
	salt := recordID[:]
	reader := hkdf.New(sha256.New, ks.masterKey, salt, info)
	key := make([]byte, 32)
	if _, err := io.ReadFull(reader, key); err != nil {
		return nil, err
	}
	return key, nil
}

// Encrypt encrypts plaintext with AES-256-GCM using a key derived from recordID.
// The returned ciphertext is: nonce (12 bytes) || GCM ciphertext+tag.
func (ks *KeyStore) Encrypt(plaintext []byte, recordID uuid.UUID) ([]byte, error) {
	key, err := ks.deriveKey(recordID)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt decrypts a ciphertext produced by Encrypt using the same recordID.
func (ks *KeyStore) Decrypt(ciphertext []byte, recordID uuid.UUID) ([]byte, error) {
	key, err := ks.deriveKey(recordID)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, ct, nil)
}
