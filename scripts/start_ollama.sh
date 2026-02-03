#!/bin/bash
# Start Ollama inference server

set -e

echo "===== Starting Ollama Server ====="

# Default model
DEFAULT_MODEL="qwen2.5:7b-instruct"
FALLBACK_MODEL="qwen2.5:3b-instruct"

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "Error: Ollama not installed"
    echo ""
    echo "Install Ollama:"
    echo "  Linux:   curl -fsSL https://ollama.com/install.sh | sh"
    echo "  macOS:   brew install ollama"
    echo "  Windows: Download from https://ollama.com/download"
    exit 1
fi

# Check if Ollama service is running
if ! pgrep -x "ollama" > /dev/null 2>&1; then
    echo "Starting Ollama service..."
    ollama serve &
    sleep 3
fi

# Check available memory to decide which model to use
AVAILABLE_MEM_GB=$(free -g 2>/dev/null | awk '/^Mem:/{print $7}' || echo "16")
if [ "$AVAILABLE_MEM_GB" -lt 8 ]; then
    echo "Low memory detected (${AVAILABLE_MEM_GB}GB available), using smaller model"
    MODEL="$FALLBACK_MODEL"
else
    MODEL="$DEFAULT_MODEL"
fi

echo ""
echo "Checking model: $MODEL"

# Check if model is already downloaded
if ! ollama list | grep -q "^$MODEL"; then
    echo "Model $MODEL not found. Downloading..."
    echo "This may take a few minutes depending on your connection speed."
    echo ""
    ollama pull "$MODEL"
fi

echo ""
echo "✓ Ollama is ready"
echo "  Model: $MODEL"
echo "  API endpoint: http://localhost:11434"
echo "  OpenAI-compatible: http://localhost:11434/v1"
echo ""
echo "GPU support:"
echo "  - NVIDIA (Linux/Windows): Automatic if CUDA drivers installed"
echo "  - Apple Silicon (macOS): Automatic via Metal"
echo "  - AMD (Linux): Automatic if ROCm installed"
echo ""
echo "To check GPU usage: ollama ps"
echo "To run a different model: ollama run <model-name>"
echo ""

# Keep the script running to maintain the Ollama service in tmux
echo "Ollama service running. Press Ctrl+C to stop."
wait
