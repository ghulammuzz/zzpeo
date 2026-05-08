package jwt

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const tokenTTL = 24 * time.Hour

type Claims struct {
	Sub      string `json:"sub"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Exp      int64  `json:"exp"`
	Iat      int64  `json:"iat"`
}

var jwtHeader = base64.RawURLEncoding.EncodeToString(
	[]byte(`{"alg":"HS256","typ":"JWT"}`),
)

func Sign(claims Claims, secret []byte) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("jwt.Sign: marshal: %w", err)
	}
	b64payload := base64.RawURLEncoding.EncodeToString(payload)
	msg := jwtHeader + "." + b64payload

	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(msg))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return msg + "." + sig, nil
}

func Verify(tokenStr string, secret []byte) (*Claims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("jwt: invalid token format")
	}

	msg := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(msg))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expected)) {
		return nil, fmt.Errorf("jwt: invalid signature")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("jwt: decode payload: %w", err)
	}

	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("jwt: unmarshal claims: %w", err)
	}

	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("jwt: token expired")
	}

	return &claims, nil
}

func NewClaims(userID, username, role string) Claims {
	now := time.Now()
	return Claims{
		Sub:      userID,
		Username: username,
		Role:     role,
		Iat:      now.Unix(),
		Exp:      now.Add(tokenTTL).Unix(),
	}
}
