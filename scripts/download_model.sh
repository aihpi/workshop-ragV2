#!/bin/bash
# Download and setup Qwen 2.5 0.5B model (open source alternative)

set -e

echo "===== Qwen 2.5 0.5B Model Download ====="
echo ""
echo "This script will download the Qwen 2.5 0.5B Instruct model."
echo "Model size: ~1.2 GB (smaller, open source alternative)"
echo ""

# Create models directory
MODELS_DIR="../models"
mkdir -p "$MODELS_DIR"

# Check if model already exists
MODEL_PATH="$MODELS_DIR/Qwen2.5-0.5B-Instruct"

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
    pip install huggingface-hub[cli]
fi

# Download model
echo "Starting download..."
huggingface-cli download Qwen/Qwen2.5-0.5B-Instruct \
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
