#!/bin/bash
# Setup script for RAG backend

set -e

ENV_FILE=".env"

get_env_value() {
    local key="$1"
    local default_value="$2"

    if [ -f "$ENV_FILE" ]; then
        local value
        value=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        if [ -n "$value" ]; then
            echo "$value"
            return
        fi
    fi

    echo "$default_value"
}

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
LLM_PROVIDER_CONFIGURED="${LLM_PROVIDER:-$(get_env_value "LLM_PROVIDER" "ollama")}"
if [ "$LLM_PROVIDER_CONFIGURED" = "ollama" ]; then
    echo "2. Make sure Ollama is running: ollama serve"
else
    echo "2. Verify OpenAI-compatible settings in .env (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_LLM_MODEL)"
fi
echo "3. Start Qdrant: ./scripts/start_qdrant.sh"
echo "4. Run backend: uvicorn app.main:app --reload"
