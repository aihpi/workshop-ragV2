#!/bin/bash
# Stop all RAG tool services

set -e

echo "===== Stopping RAG Tool Services ====="

SESSION="rag-tool"

# Kill tmux session
if tmux has-session -t $SESSION 2>/dev/null; then
    tmux kill-session -t $SESSION
    echo "✓ Stopped tmux session '$SESSION'"
else
    echo "No tmux session found"
fi

# Kill any remaining processes
echo "Stopping backend processes..."
pkill -f "uvicorn app.main:app" || true
echo "Stopping vLLM processes..."
pkill -f "vllm.entrypoints.openai.api_server" || true

# Stop Docker containers if running
if command -v docker &> /dev/null; then
    # Stop Qdrant (note: we don't remove it to preserve data)
    if docker ps -q -f name=^qdrant$ &>/dev/null; then
        echo "Stopping Qdrant container..."
        docker stop qdrant 2>/dev/null || true
        echo "✓ Qdrant stopped (container preserved for data persistence)"
    fi
    
    # Stop Neo4j (note: we don't remove it to preserve graph data)
    if docker ps -q -f name=^neo4j$ &>/dev/null; then
        echo "Stopping Neo4j container..."
        docker stop neo4j 2>/dev/null || true
        echo "✓ Neo4j stopped (graph data preserved in ./neo4j_data)"
    fi
fi

echo "✓ All services stopped"
echo ""
echo "To start services again, run: ./scripts/start_all.sh"
