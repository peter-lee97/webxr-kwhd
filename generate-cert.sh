#!/bin/bash

# HTTPS Certificate Generator for Development
# Generates self-signed SSL certificates for local development

set -e

echo "🔐 Generating HTTPS Development Certificate"
echo "=========================================="
echo ""

# Configuration
CERT_COUNTRY="US"
CERT_STATE="State"
CERT_CITY="City"
CERT_ORG="Dev"
CERT_ORG_UNIT="Dev"
CERT_COMMON_NAME="localhost"
CERT_DAYS=365

echo "📋 Certificate Details:"
echo "  Country: $CERT_COUNTRY"
echo "  State: $CERT_STATE"
echo "  City: $CERT_CITY"
echo "  Organization: $CERT_ORG"
echo "  Common Name: $CERT_COMMON_NAME"
echo "  Validity: $CERT_DAYS days"
echo ""

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: OpenSSL is not installed"
    echo ""
    echo "Install OpenSSL:"
    echo "  macOS:   brew install openssl"
    echo "  Ubuntu:   sudo apt install openssl"
    echo "  Windows:  Download from https://slproweb.com/products/Win32OpenSSL.html"
    exit 1
fi

# Check if files already exist
if [ -f "key.pem" ] || [ -f "cert.pem" ]; then
    echo "⚠️  Warning: Certificate files already exist!"
    echo ""
    read -p "Overwrite existing files? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Cancelled - keeping existing files"
        exit 0
    fi
    echo "🗑️  Removing existing files..."
    rm -f key.pem cert.pem
fi

# Generate certificate
echo "🔧 Generating private key and certificate..."
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days $CERT_DAYS -nodes \
    -subj "/C=$CERT_COUNTRY/ST=$CERT_STATE/L=$CERT_CITY/O=$CERT_ORG/OU=$CERT_ORG_UNIT/CN=$CERT_COMMON_NAME" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Certificate generated successfully!"
    echo ""
    echo "📁 Files created:"
    echo "  - key.pem (private key)"
    echo "  - cert.pem (certificate)"
    echo ""
    
    # Set proper permissions
    chmod 600 key.pem
    chmod 644 cert.pem
    echo "🔒 File permissions set:"
    echo "  - key.pem: 600 (owner read/write only)"
    echo "  - cert.pem: 644 (owner read/write, others read)"
    echo ""
    
    # Check if .gitignore includes these files
    if [ -f ".gitignore" ]; then
        if grep -q "^key.pem$" .gitignore && grep -q "^cert.pem$" .gitignore; then
            echo "✅ .gitignore already configured correctly"
        else
            echo "⚠️  Adding certificate files to .gitignore..."
            echo "" >> .gitignore
            echo "# SSL certificates for local development" >> .gitignore
            echo "key.pem" >> .gitignore
            echo "cert.pem" >> .gitignore
            echo "✅ .gitignore updated"
        fi
    fi
    
    echo ""
    echo "🚀 Ready to start HTTPS development server!"
    echo ""
    echo "Next steps:"
    echo "  1. Run: npm run dev"
    echo "  2. Open: https://localhost:5173"
    echo "  3. Accept browser security warning"
    echo ""
    echo "📚 For more details, see: HTTPS_SETUP.md"
else
    echo "❌ Error: Certificate generation failed"
    echo ""
    echo "Troubleshooting:"
    echo "  - Make sure OpenSSL is properly installed"
    echo "  - Check file write permissions in current directory"
    echo "  - Try running with administrator privileges"
    exit 1
fi
