# HTTPS Development Setup Guide

## Overview

This guide explains how to generate self-signed SSL/TLS certificates (`.pem` files) for local HTTPS development, which is required for WebXR and secure features to work properly.

## Why HTTPS in Development?

- **WebXR Requirements:** VR/AR features often require HTTPS
- **Secure Contexts:** Many browser APIs only work over secure connections
- **Localhost Exception:** Self-signed certificates work fine for `localhost` development

## Prerequisites

- OpenSSL installed (included with most systems)
- Node.js development environment
- Basic command line knowledge

## Generate Self-Signed Certificate

### Quick One-Liner (Recommended)

Generate a single command that creates both key and certificate:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Dev/OU=Dev/CN=localhost"
```

**Parameters explained:**
- `-x509`: Self-signed certificate format
- `-newkey rsa:2048`: 2048-bit RSA key
- `-keyout key.pem`: Output private key file
- `-out cert.pem`: Output certificate file
- `-days 365`: Valid for 1 year
- `-nodes`: No password on private key (easier for development)
- `-subj`: Certificate subject information

### Alternative: Separate Commands

If you prefer step-by-step:

```bash
# 1. Generate private key
openssl genrsa -out key.pem 2048

# 2. Generate self-signed certificate
openssl req -new -x509 -key key.pem -out cert.pem -days 365 \
  -subj "/C=US/ST=State/L=City/O=Dev/OU=Dev/CN=localhost"
```

## Custom Certificate Details

For more control, create a configuration file:

### Create `cert.conf`
```ini
[req]
default_bits = 2048
distinguished_name = req_distinguished_name
req_extensions = v3_req
x509_extensions = v3_req

[req_distinguished_name]
countryName = US
stateOrProvinceName = State
localityName = City
organizationName = Dev
organizationalUnitName = Dev
commonName = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
```

### Generate with config file:
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 \
  -nodes -config cert.conf -extensions v3_req -subj "/CN=localhost"
```

## Project Configuration

The generated files should be placed in your project root:

```
webxr-kwhd/
├── key.pem        # Private key
├── cert.pem       # Certificate
├── vite.config.js # Already configured to use these
└── .gitignore     # Should include these files
```

### Vite Configuration

Your `vite.config.js` is already configured to use these files:

```javascript
server: {
    https: {
        key: './key.pem',
        cert: './cert.pem'
    },
    host: '0.0.0.0',
    port: 5173
}
```

## Browser Security Handling

### First Time Load

When you first access `https://localhost:5173`, browsers will show security warnings:

**Chrome/Edge:**
- "Your connection is not private"
- Click "Advanced" → "Proceed to localhost (unsafe)"

**Firefox:**
- "Warning: Potential Security Risk Ahead"
- Click "Advanced" → "Accept the Risk and Continue"

**Safari:**
- "This Connection Is Not Private"
- Click "Visit this website"

### Certificate Trust (Optional)

To avoid repeated warnings:

**macOS Keychain:**
```bash
# Add to system keychain
sudo security add-trusted-cert -k cert.pem -p ssl
```

**Windows:**
1. Open `cert.pem` in Notepad
2. Install certificate to "Trusted Root Certification Authorities"

**Linux (Chrome/Edge):**
1. Open `chrome://settings/certificates`
2. Import `cert.pem` to "Authorities"

## File Security

**Important:** Add `.pem` files to `.gitignore`:

```gitignore
# SSL certificates for local development
key.pem
cert.pem
```

**Why not commit:**
- Private keys should never be shared
- Each developer should generate their own
- Different certificates for different machines

## Troubleshooting

### Certificate Expired
```bash
# Regenerate with longer validity (days parameter)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 1825
```

### Wrong Domain
Make sure your certificate matches the host you're accessing:
- If using `localhost`, CN should be `localhost`
- If using `127.0.0.1`, include in Subject Alternative Names

### Port Issues
If you get port conflicts (port 5173 already in use), Vite will automatically try the next available port (5174, 5175, etc.)

### Permission Errors
```bash
# Ensure files are readable
chmod 644 cert.pem
chmod 600 key.pem  # More restrictive for private key
```

## Production vs Development

**Development (Self-Signed):**
- ✅ Fast setup
- ✅ Free
- ❌ Browser warnings
- ❌ Not for public use

**Production (Signed):**
- ✅ No browser warnings
- ✅ Trusted by users
- ❌ Costs money (Let's Encrypt is free though!)
- ❌ Requires domain ownership

For production, use **Let's Encrypt** (free) or a commercial CA.

## Quick Reference

```bash
# Generate certificate (one command)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Dev/OU=Dev/CN=localhost"

# Start development server
npm run dev

# Access in browser
https://localhost:5173

# Accept security warning on first load
```

## Additional Resources

- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Vite HTTPS Guide](https://vitejs.dev/config/server-options.html#server-https)
- [Let's Encrypt (Free Certificates)](https://letsencrypt.org/)
- [MDN: Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)

## Notes

- Self-signed certificates are **only for development**
- Never share your private key (`key.pem`)
- Regenerate certificates annually or if compromised
- HTTPS is required for WebXR in many browsers
- Localhost is a special domain that browsers accept self-signed certs
