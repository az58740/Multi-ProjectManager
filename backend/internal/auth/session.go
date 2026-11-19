package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type sessionClaims struct {
	AppID   string `json:"appId"`
	OpenID  string `json:"openId"`
	Expires int64  `json:"exp"`
	Issued  int64  `json:"iat,omitempty"`
}

func (o *OAuth) readSession(raw string) (User, error) {
	if o.projectID == "" || len(o.jwtSecret) == 0 {
		return User{}, errors.New("session verifier is not configured")
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return User{}, errors.New("malformed session token")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return User{}, errors.New("malformed session header")
	}
	var header struct {
		Algorithm string `json:"alg"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil || header.Algorithm != "HS256" {
		return User{}, errors.New("unsupported session signature")
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return User{}, errors.New("malformed session signature")
	}
	mac := hmac.New(sha256.New, o.jwtSecret)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return User{}, errors.New("invalid session signature")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return User{}, errors.New("malformed session payload")
	}
	var claims sessionClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return User{}, errors.New("malformed session claims")
	}
	if claims.AppID != o.projectID || claims.OpenID == "" || claims.Expires <= time.Now().Unix() {
		return User{}, errors.New("expired or mismatched session")
	}
	return User{OpenID: claims.OpenID}, nil
}

func (o *OAuth) signSession(openID string, lifetime time.Duration) (string, error) {
	if o.projectID == "" || len(o.jwtSecret) == 0 || openID == "" {
		return "", errors.New("session signer is not configured")
	}
	header, err := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}
	now := time.Now()
	claims, err := json.Marshal(sessionClaims{
		AppID: o.projectID, OpenID: openID, Expires: now.Add(lifetime).Unix(), Issued: now.Unix(),
	})
	if err != nil {
		return "", err
	}
	unsigned := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(claims)
	mac := hmac.New(sha256.New, o.jwtSecret)
	_, _ = mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
