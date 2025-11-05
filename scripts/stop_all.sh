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
pkill -f "uvicorn app.main:app" || true
pkill -f "vllm.entrypoints.openai.api_server" || true
pkill -f "qdrant" || true

# Stop Docker containers if running
if command -v docker &> /dev/null; then
    docker stop qdrant 2>/dev/null || true
    docker rm qdrant 2>/dev/null || true
fi

echo "✓ All services stopped"
