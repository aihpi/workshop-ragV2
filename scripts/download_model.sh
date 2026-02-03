#!/bin/bash
# Download and setup Llama 3.2 3B model (default model)

set -e

echo "===== Llama 3.2 3B Model Download ====="
echo ""
echo "This script will download the Llama 3.2 3B Instruct model."
echo "Model size: ~6 GB"
echo ""

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Create models directory in project root
MODELS_DIR="$PROJECT_ROOT/models"
mkdir -p "$MODELS_DIR"

# Check if model already exists
MODEL_PATH="$MODELS_DIR/Llama-3.2-3B-Instruct"

if [ -d "$MODEL_PATH" ]; then
    echo "✓ Model already exists at $MODEL_PATH"
    echo ""
    read -p "Re-download? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping download."
        exit 0
    fi
fi

echo ""
echo "Downloading model from HuggingFace..."
echo ""

# Check if huggingface-cli is available
if ! command -v huggingface-cli &> /dev/null; then
    echo "Installing huggingface-hub..."
    uv pip install huggingface-hub[cli]
fi

# Download model
echo "Starting download..."
huggingface-cli download meta-llama/Llama-3.2-3B-Instruct \
    --local-dir "$MODEL_PATH" \
    --local-dir-use-symlinks False

echo ""
echo "✓ Model downloaded successfully to $MODEL_PATH"
echo ""
echo "To use this model with vLLM:"
echo "  python -m vllm.entrypoints.openai.api_server \\"
echo "    --model $MODEL_PATH \\"
echo "    --port 8001 \\"
echo "    --max-model-len 8192"
