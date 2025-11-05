#!/bin/bash
# Start Qdrant vector database

set -e

echo "===== Starting Qdrant ====="

QDRANT_STORAGE="../qdrant_storage"
QDRANT_PORT=6333

# Create storage directory
mkdir -p "$QDRANT_STORAGE"

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "Starting Qdrant with Docker..."
    docker run -d \
        --name qdrant \
        -p $QDRANT_PORT:6333 \
        -v "$(pwd)/$QDRANT_STORAGE:/qdrant/storage" \
        qdrant/qdrant
    echo "✓ Qdrant started on port $QDRANT_PORT"
    echo "  Dashboard: http://localhost:6333/dashboard"
else
    echo "Docker not found. Installing Qdrant locally..."
    
    # Check if Qdrant is already installed
    if ! command -v qdrant &> /dev/null; then
        echo "Downloading Qdrant binary..."
        QDRANT_VERSION="v1.7.4"
        OS=$(uname -s | tr '[:upper:]' '[:lower:]')
        ARCH=$(uname -m)
        
        if [ "$ARCH" = "x86_64" ]; then
            ARCH="amd64"
        elif [ "$ARCH" = "aarch64" ]; then
            ARCH="arm64"
        fi
        
        DOWNLOAD_URL="https://github.com/qdrant/qdrant/releases/download/$QDRANT_VERSION/qdrant-$OS-$ARCH"
        
        curl -L "$DOWNLOAD_URL" -o qdrant
        chmod +x qdrant
        sudo mv qdrant /usr/local/bin/
        echo "✓ Qdrant installed"
    fi
    
    echo "Starting Qdrant..."
    qdrant --storage-path "$QDRANT_STORAGE" &
    echo "✓ Qdrant started on port $QDRANT_PORT"
fi

echo ""
echo "Qdrant is ready!"
echo "API endpoint: http://localhost:$QDRANT_PORT"
