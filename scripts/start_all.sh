#!/bin/bash
# Start all services for RAG tool

set -e

echo "===== Starting RAG Tool Services ====="
echo ""

# Check if backend is set up
if [ ! -d "backend/.venv" ]; then
    echo "Error: Backend not set up. Run ./scripts/setup_all.sh first"
    exit 1
fi

# Check if model exists (check for Qwen model first, then Llama)
if [ ! -d "models/Qwen2.5-3B-Instruct" ] && [ ! -d "models/Qwen2.5-0.5B-Instruct" ] && [ ! -d "models/Llama-3.2-3B-Instruct" ]; then
    echo "Warning: Model not found. Run ./scripts/download_model.sh"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
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

# Start Neo4j container (for Graph RAG)
echo "Starting Neo4j..."
if command -v docker &> /dev/null; then
    # Create neo4j_data directory if it doesn't exist (for persistence)
    mkdir -p neo4j_data neo4j_plugins
    
    # Check if container exists
    if docker ps -a -q -f name=^neo4j$ &>/dev/null; then
        # Container exists, start it
        docker start neo4j 2>/dev/null || true
    else
        # Create new container
        docker run -d \
            --name neo4j \
            -p 7474:7474 \
            -p 7687:7687 \
            -v "$(pwd)/neo4j_data:/data" \
            -v "$(pwd)/neo4j_plugins:/plugins" \
            -e NEO4J_AUTH=neo4j/neo4jpassword \
            -e NEO4J_PLUGINS='["apoc"]' \
            --restart unless-stopped \
            neo4j:5-community
    fi
    echo "✓ Neo4j started (data persisted in ./neo4j_data)"
else
    echo "⚠ Docker not found, skipping Neo4j (Graph RAG features disabled)"
fi

# Create new session with Qdrant
tmux new-session -d -s $SESSION -n qdrant
tmux send-keys -t $SESSION:qdrant "./scripts/start_qdrant.sh" C-m

# Wait a bit for Qdrant to start
sleep 2

# Create window for vLLM
tmux new-window -t $SESSION -n vllm
tmux send-keys -t $SESSION:vllm "./scripts/start_vllm.sh" C-m

# Wait for vLLM to start
sleep 5

# Create window for backend
tmux new-window -t $SESSION -n backend
tmux send-keys -t $SESSION:backend "cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" C-m

echo "✓ All services started in tmux session '$SESSION'"
echo ""
echo "To view services:"
echo "  tmux attach -t $SESSION"
echo ""
echo "To switch between windows in tmux:"
echo "  Ctrl+b then 0, 1, 2 (for different windows)"
echo ""
echo "To detach from tmux:"
echo "  Ctrl+b then d"
echo ""
echo "To stop all services:"
echo "  ./scripts/stop_all.sh"
echo ""
echo "Services:"
echo "  - Qdrant: http://localhost:6333"
echo "  - vLLM: http://localhost:8001"
echo "  - Backend: http://localhost:8000"
echo "  - API Docs: http://localhost:8000/docs"
