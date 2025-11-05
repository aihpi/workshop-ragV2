#!/bin/bash
# Complete setup script for RAG tool

set -e

echo "===== RAG Tool Complete Setup ====="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 not found"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python $PYTHON_VERSION"

if ! command -v git &> /dev/null; then
    echo "Error: git not found"
    exit 1
fi
echo "✓ git"

# Create directories
echo ""
echo "Creating directories..."
mkdir -p data chat_history qdrant_storage models
echo "✓ Directories created"

# Setup backend
echo ""
echo "===== Setting up Backend ====="
cd backend
./setup.sh
cd ..

# Download model
echo ""
echo "===== Downloading Model ====="
read -p "Download Llama 3.2 3B model now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./scripts/download_model.sh
else
    echo "Skipping model download. You can run ./scripts/download_model.sh later."
fi

echo ""
echo "===== Setup Complete ====="
echo ""
echo "Next steps:"
echo "1. Start services:"
echo "   ./scripts/start_all.sh"
echo ""
echo "2. Or start services manually:"
echo "   Terminal 1: ./scripts/start_qdrant.sh"
echo "   Terminal 2: ./scripts/start_vllm.sh"
echo "   Terminal 3: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload"
echo ""
echo "3. For Docker deployment:"
echo "   docker-compose up -d"
