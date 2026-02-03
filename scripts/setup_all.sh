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

# Check for Ollama
if command -v ollama &> /dev/null; then
    echo "✓ Ollama"
else
    echo "⚠ Ollama not found"
    echo "  Install with: curl -fsSL https://ollama.com/install.sh | sh"
fi

# Create directories
echo ""
echo "Creating directories..."
mkdir -p data chat_history qdrant_storage
echo "✓ Directories created"

# Setup backend
echo ""
echo "===== Setting up Backend ====="
cd backend
./setup.sh
cd ..

# Download Ollama model
echo ""
echo "===== Setting up Ollama Model ====="
if command -v ollama &> /dev/null; then
    echo "Available models:"
    echo "  1) qwen2.5:7b-instruct (4.4GB) - Recommended, better quality"
    echo "  2) qwen2.5:3b-instruct (1.8GB) - For systems with limited RAM/VRAM"
    echo ""
    read -p "Which model to install? (1/2/skip): " -r
    case $REPLY in
        1)
            echo "Pulling qwen2.5:7b-instruct..."
            ollama pull qwen2.5:7b-instruct
            ;;
        2)
            echo "Pulling qwen2.5:3b-instruct..."
            ollama pull qwen2.5:3b-instruct
            echo "Note: Update OLLAMA_MODEL in backend/.env to 'qwen2.5:3b-instruct'"
            ;;
        *)
            echo "Skipping model download. Run 'ollama pull qwen2.5:7b-instruct' later."
            ;;
    esac
else
    echo "Ollama not installed. Install it first, then run 'ollama pull qwen2.5:7b-instruct'"
fi

echo ""
echo "===== Setup Complete ====="
echo ""
echo "Next steps:"
echo "1. Make sure Ollama is running:"
echo "   ollama serve  (or check if it's already running)"
echo ""
echo "2. Start all services:"
echo "   ./scripts/start_all.sh"
echo ""
echo "3. Or start services manually:"
echo "   Terminal 1: ./scripts/start_qdrant.sh"
echo "   Terminal 2: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload"
echo ""
echo "4. For Docker deployment:"
echo "   docker-compose up -d"
