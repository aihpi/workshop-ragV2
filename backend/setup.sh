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
    echo "Creating virtual environment with uv..."
    uv venv
    echo "Installing dependencies with uv add..."
    
    # Install dependencies one by one using uv add
    uv add "fastapi>=0.109.0"
    uv add "uvicorn[standard]>=0.27.0"
    uv add "qdrant-client>=1.7.0"
    uv add "sentence-transformers>=2.3.0"
    uv add "python-multipart>=0.0.6"
    uv add "PyPDF2>=3.0.1"
    uv add "python-docx>=1.1.0"
    uv add "beautifulsoup4>=4.12.2"
    uv add "lxml>=5.0.0"
    uv add "pydantic>=2.5.0"
    uv add "pydantic-settings>=2.1.0"
    uv add "httpx>=0.26.0"
    uv add "aiofiles>=23.2.1"
    
    # Skip vllm for now as it requires GPU/special setup
    echo "Note: vLLM will be installed separately when starting the LLM server"
    
else
    echo "Error: uv not found. Please install uv first."
    echo "Install uv with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo "✓ Dependencies installed"

echo ""
echo "===== Setup Complete ====="
echo ""
echo "Next steps:"
echo "1. Activate virtual environment: source .venv/bin/activate"
echo "2. Start Qdrant: ./scripts/start_qdrant.sh"
echo "3. Start vLLM server: ./scripts/start_vllm.sh"
echo "4. Run backend: uvicorn app.main:app --reload"
