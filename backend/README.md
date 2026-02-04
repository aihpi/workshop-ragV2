# RAG Backend

FastAPI backend for the RAG tool with support for multiple LLM and embedding providers.

## Setup

### Using uv (recommended)

```bash
# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e .
```

### Using pip

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
uv pip install -e .
```

## Configuration

Copy `.env.example` to `.env` and adjust settings as needed:

```bash
cp .env.example .env
```

### Provider Selection

The backend supports two modes of operation:

#### 1. Local Mode (Default) - Ollama + SentenceTransformers

Uses locally running Ollama for LLM inference and SentenceTransformers for embeddings.

```env
LLM_PROVIDER=ollama
EMBEDDING_PROVIDER=local

# Ollama settings
OLLAMA_HOST=localhost
OLLAMA_PORT=11434
OLLAMA_MODEL=qwen2.5:7b-instruct

# Local embedding settings
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIM=384
```

**Requirements:**
- Ollama must be installed and running
- No API key needed

#### 2. API Mode - OpenAI-Compatible API

Uses an OpenAI-compatible API for both LLM and embeddings.

```env
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai

# API settings
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=http://10.127.129.0:4000
OPENAI_LLM_MODEL=gpt-oss-120b
OPENAI_EMBEDDING_MODEL=octen-embedding-8b
OPENAI_EMBEDDING_DIM=4096
```

**Important:** 
- Never commit your API key to version control!
- The `.env` file is already in `.gitignore`
- You can also mix providers (e.g., `LLM_PROVIDER=openai` with `EMBEDDING_PROVIDER=local`)

### Embedding Dimension Compatibility

When switching between embedding providers, the vector dimensions may differ:
- Local SentenceTransformers (all-MiniLM-L6-v2): 384 dimensions
- OpenAI-compatible API: varies (e.g., 4096 dimensions)

The backend automatically detects dimension mismatches at startup and will:
1. Warn you about the mismatch
2. Automatically recreate the Qdrant collection with the correct dimensions
3. **Note:** This deletes all existing vectors - you'll need to re-upload your documents

## Running

Make sure Qdrant is running (and Ollama if using local mode), then:

```bash
# Development mode with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Documents
- `POST /api/v1/documents/upload` - Upload a document
- `GET /api/v1/documents/list` - List all documents
- `DELETE /api/v1/documents/{document_id}` - Delete a document
- `POST /api/v1/documents/sync` - Sync documents from data folder

### Query
- `POST /api/v1/query/query` - Non-streaming RAG query
- `POST /api/v1/query/query/stream` - Streaming RAG query (SSE)

### Chat
- `POST /api/v1/chat/new` - Create new chat session
- `GET /api/v1/chat/list` - List all sessions
- `GET /api/v1/chat/{session_id}` - Get session history
- `DELETE /api/v1/chat/{session_id}` - Delete session

### Models
- `GET /api/v1/models/` - List available models
- `GET /api/v1/models/status` - Get provider connection status
- `POST /api/v1/models/set-active` - Set active model
- `POST /api/v1/models/pull` - Pull model (Ollama only)
- `DELETE /api/v1/models/{model_id}` - Delete model (Ollama only)
