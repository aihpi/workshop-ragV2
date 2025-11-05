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

# Create virtual environment with uv if available, otherwise use venv
echo ""
if command -v uv &> /dev/null; then
    echo "Creating virtual environment with uv..."
    uv venv
    source .venv/bin/activate
    echo "Installing dependencies with uv..."
    uv pip install -e .
else
    echo "uv not found, using standard venv..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "Installing dependencies with pip..."
    pip install --upgrade pip
    pip install -e .
fi

echo "✓ Dependencies installed"

echo ""
echo "===== Setup Complete ====="
echo ""
echo "Next steps:"
echo "1. Activate virtual environment: source .venv/bin/activate"
echo "2. Start Qdrant (see instructions in main README)"
echo "3. Start vLLM server (see instructions in main README)"
echo "4. Run backend: uvicorn app.main:app --reload"
