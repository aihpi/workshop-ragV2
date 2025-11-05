# RAG Backend

FastAPI backend for the RAG tool.

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
pip install -e .
```

## Configuration

Copy `.env.example` to `.env` and adjust settings as needed:

```bash
cp .env.example .env
```

## Running

Make sure Qdrant and vLLM services are running, then:

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
