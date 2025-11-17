#!/bin/bash
# Start vLLM inference server

set -e

echo "===== Starting vLLM Server ====="

# Python environment
PYTHON_VENV="./backend/.venv/bin/python"

# Configuration
MODEL_PATH="./models/Llama-3.2-3B-Instruct"
PORT=8001
MAX_MODEL_LEN=8192

# Check if model exists
if [ ! -d "$MODEL_PATH" ]; then
    echo "Error: Model not found at $MODEL_PATH"
    echo "Please run scripts/download_model.sh first"
    exit 1
fi

# Check if virtual environment exists
if [ ! -f "$PYTHON_VENV" ]; then
    echo "Error: Python virtual environment not found at $PYTHON_VENV"
    echo "Please run backend/setup.sh first"
    exit 1
fi

# Check if vLLM is installed
if ! $PYTHON_VENV -c "import vllm" 2>/dev/null; then
    echo "Error: vLLM not installed in virtual environment"
    echo "Install with: cd backend && .venv/bin/pip install vllm"
    exit 1
fi

echo "Starting vLLM server..."
echo "  Model: $MODEL_PATH"
echo "  Port: $PORT"
echo "  Max length: $MAX_MODEL_LEN"
echo ""

$PYTHON_VENV -m vllm.entrypoints.openai.api_server \
    --model "$MODEL_PATH" \
    --port "$PORT" \
    --max-model-len "$MAX_MODEL_LEN" \
    --dtype auto \
    --api-key dummy

echo ""
echo "✓ vLLM server started"
echo "  API endpoint: http://localhost:$PORT/v1"
