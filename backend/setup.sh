#!/bin/bash
# Setup script for RAG backend

set -e

echo "===== RAG Backend Setup ====="

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
REQUIRED_VERSION="3.10"

if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
    echo "Error: Python $REQUIRED_VERSION or higher required (found $PYTHON_VERSION)"
    exit 1
fi

echo "✓ Python version: $PYTHON_VERSION"

# Create directories
echo ""
echo "Creating directories..."
mkdir -p ../data ../chat_history ../qdrant_storage
echo "✓ Directories created"

# Copy environment file
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env file..."
    cp .env.example .env
    echo "✓ .env file created"
else
    echo "✓ .env file already exists"
fi

# Create virtual environment and install dependencies with uv
echo ""
if command -v uv &> /dev/null; then
    if [ -d ".venv" ]; then
        echo "Virtual environment already exists, syncing dependencies..."
        uv sync
    else
        echo "Creating virtual environment with uv..."
        uv venv
        echo "Installing dependencies from pyproject.toml..."
        uv sync
    fi
    
    echo "✓ Dependencies installed"
else
    echo "Error: uv not found. Please install uv first."
    echo "Install uv with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo ""
echo "===== Setup Complete ====="
echo ""
echo "Next steps:"
echo "1. Activate virtual environment: source .venv/bin/activate"
echo "2. Make sure Ollama is running: ollama serve"
echo "3. Start Qdrant: ./scripts/start_qdrant.sh"
echo "4. Run backend: uvicorn app.main:app --reload"
