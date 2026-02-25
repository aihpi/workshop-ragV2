#!/bin/bash
# Start all services for RAG tool

set -e

ENV_FILE="backend/.env"

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

echo "===== Starting RAG Tool Services ====="
echo ""

# Check if backend is set up
if [ ! -d "backend/.venv" ]; then
    echo "Error: Backend not set up. Run ./scripts/setup_all.sh first"
    exit 1
fi

LLM_PROVIDER="${LLM_PROVIDER:-$(get_env_value "LLM_PROVIDER" "ollama")}"
OPENAI_BASE_URL="${OPENAI_BASE_URL:-$(get_env_value "OPENAI_BASE_URL" "http://localhost:4000")}"
OPENAI_LLM_MODEL="${OPENAI_LLM_MODEL:-$(get_env_value "OPENAI_LLM_MODEL" "gpt-oss-120b")}"
OPENAI_API_KEY="${OPENAI_API_KEY:-$(get_env_value "OPENAI_API_KEY" "")}"

echo "Detected LLM provider: $LLM_PROVIDER"
echo ""

# Check if Ollama is installed only when using Ollama provider
if [ "$LLM_PROVIDER" = "ollama" ] && ! command -v ollama &> /dev/null; then
    echo "Error: Ollama is not installed."
    echo ""
    echo "Install Ollama:"
    echo "  Linux: curl -fsSL https://ollama.com/install.sh | sh"
    echo "  macOS: brew install ollama"
    echo ""
    echo "Or download from: https://ollama.com/download"
    exit 1
fi

# Check if services are already running
if tmux has-session -t rag-tool 2>/dev/null; then
    echo "Services are already running in tmux session 'rag-tool'"
    echo ""
    echo "Options:"
    echo "  1. Attach to existing session: tmux attach -t rag-tool"
    echo "  2. Stop and restart: ./scripts/stop_all.sh && ./scripts/start_all.sh"
    echo ""
    read -p "Restart services? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./scripts/stop_all.sh
        sleep 2
    else
        exit 0
    fi
fi

# Create tmux session
SESSION="rag-tool"

# Kill existing session if it exists
tmux kill-session -t $SESSION 2>/dev/null || true

echo "Starting services in tmux session '$SESSION'..."
echo ""

# Start Ollama only when configured as provider
if [ "$LLM_PROVIDER" = "ollama" ]; then
    echo "Starting Ollama..."
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✓ Ollama is already running"
    else
        ollama serve &
        sleep 3
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "✓ Ollama started"
        else
            echo "⚠ Warning: Ollama may not be ready yet"
        fi
    fi
else
    echo "Skipping Ollama startup (LLM_PROVIDER=$LLM_PROVIDER)"
    echo "Using OpenAI-compatible API: $OPENAI_BASE_URL"
    echo "Configured model: $OPENAI_LLM_MODEL"
    if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_api_key_here" ]; then
        echo "⚠ Warning: OPENAI_API_KEY is empty or still set to placeholder value"
    fi
fi

# Create new session with Qdrant
tmux new-session -d -s $SESSION -n qdrant
tmux send-keys -t $SESSION:qdrant "./scripts/start_qdrant.sh" C-m

# Wait a bit for Qdrant to start
sleep 2

# Create window for backend
tmux new-window -t $SESSION -n backend
tmux send-keys -t $SESSION:backend "cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" C-m

# Wait for backend to become reachable
echo "Waiting for backend health check..."
BACKEND_READY=false
for _ in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        BACKEND_READY=true
        break
    fi
    sleep 2
done

if [ "$BACKEND_READY" = true ]; then
    echo "✓ Backend is reachable at http://localhost:8000"
else
    echo "⚠ Warning: Backend is not reachable yet on port 8000"
    echo "  This can happen if startup is still in progress or if port 8000 is already in use."
    echo "  Check logs with: tmux attach -t $SESSION"
fi

echo "✓ All services started in tmux session '$SESSION'"
echo ""
echo "To view services:"
echo "  tmux attach -t $SESSION"
echo ""
echo "To switch between windows in tmux:"
echo "  Ctrl+b then 0, 1 (for different windows)"
echo ""
echo "To detach from tmux:"
echo "  Ctrl+b then d"
echo ""
echo "To stop all services:"
echo "  ./scripts/stop_all.sh"
echo ""
echo "Services:"
if [ "$LLM_PROVIDER" = "ollama" ]; then
    echo "  - Ollama: http://localhost:11434"
else
    echo "  - OpenAI-compatible API: $OPENAI_BASE_URL"
fi
echo "  - Qdrant: http://localhost:6333"
echo "  - Backend: http://localhost:8000"
echo "  - API Docs: http://localhost:8000/docs"
