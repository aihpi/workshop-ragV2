# RAG Tool - Retrieval-Augmented Generation

An educational RAG (Retrieval-Augmented Generation) system with a FastAPI backend, React frontend, Qdrant vector database, and vLLM for inference.

![Logo](img/logo_aisc_bmftr.jpg)

## Features

- **Document Management**: Upload and process PDF, DOCX, TXT, MD, HTML, and XML files
- **Vector Search**: Semantic search using Qdrant and SentenceTransformers
- **RAG Query**: Answer questions based on document content
- **Streaming Responses**: Real-time token streaming using Server-Sent Events
- **Chat History**: Persistent chat sessions with conversation context
- **Multiple Interfaces**: Web UI with 6 specialized tabs
- **Flexible Deployment**: Docker or native installation

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend    │────▶│   Qdrant    │
│  (React)    │     │  (FastAPI)   │     │  (Vectors)  │
│  Port 3000  │     │  Port 8000   │     │  Port 6333  │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │     vLLM     │
                    │ (Llama 3.2)  │
                    │  Port 8001   │
                    └──────────────┘
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Docker (optional, for containerized deployment)
- 16GB+ RAM recommended
- GPU recommended (for vLLM)

### Installation

#### Method 1: Automated Setup (Recommended)

```bash
# Clone/navigate to repository
cd workshop-rag

# Run setup script
./scripts/setup_all.sh

# Start all services
./scripts/start_all.sh
```

#### Method 2: Manual Setup

**1. Backend Setup**

```bash
cd backend
./setup.sh
source .venv/bin/activate
```

**2. Download Model**

```bash
cd ..
./scripts/download_model.sh
```

**3. Start Services**

Terminal 1 - Qdrant:
```bash
./scripts/start_qdrant.sh
```

Terminal 2 - vLLM:
```bash
./scripts/start_vllm.sh
```

Terminal 3 - Backend:
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**4. Frontend Setup**

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000

## Usage

### Document Upload

1. Navigate to **Upload Documents** tab
2. Select files (PDF, DOCX, TXT, MD, HTML, XML)
3. Click Upload
4. Documents are automatically chunked and embedded

### Querying

1. Navigate to **Query Documents** tab
2. Enter your question
3. Adjust parameters (temperature, top-k, etc.)
4. View streaming response and retrieved sources

### Chat Mode

1. Navigate to **Chat History** tab
2. Create new chat session
3. Ask questions with conversation context
4. View and manage chat history

## Configuration

### Backend Configuration

Edit `backend/.env`:

```bash
# LLM Settings
LLM_MODEL=meta-llama/Llama-3.2-3B-Instruct
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=512

# Document Processing
CHUNK_SIZE=512
CHUNK_OVERLAP=128

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

### Frontend Configuration

Edit `frontend/.env`:

```bash
VITE_API_URL=http://localhost:8000
```

## API Endpoints

### Documents
- `POST /api/v1/documents/upload` - Upload document
- `GET /api/v1/documents/list` - List all documents
- `DELETE /api/v1/documents/{id}` - Delete document
- `POST /api/v1/documents/sync` - Sync from data folder

### Query
- `POST /api/v1/query/query` - Non-streaming query
- `POST /api/v1/query/query/stream` - Streaming query (SSE)

### Chat
- `POST /api/v1/chat/new` - Create session
- `GET /api/v1/chat/list` - List sessions
- `GET /api/v1/chat/{id}` - Get history
- `DELETE /api/v1/chat/{id}` - Delete session

## Project Structure

```
workshop-rag/
├── backend/
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── core/         # Configuration
│   │   ├── models/       # Data models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   └── main.py       # FastAPI app
│   ├── pyproject.toml
│   └── setup.sh
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── services/     # API client
│   │   └── App.tsx
│   └── package.json
├── data/                 # Document storage
├── chat_history/         # Chat sessions
├── qdrant_storage/       # Vector DB
├── models/              # Downloaded models
└── scripts/             # Setup scripts
```

## Development

### Backend Development

```bash
cd backend
source .venv/bin/activate

# Run with auto-reload
uvicorn app.main:app --reload

# Run tests
pytest

# Format code
black app/
isort app/
```

### Frontend Development

```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check
```

## Troubleshooting

### Backend won't start
- Check if Qdrant is running: `curl http://localhost:6333`
- Check if vLLM is running: `curl http://localhost:8001/v1/models`
- Verify `.env` configuration

### Model download fails
- Login to HuggingFace: `huggingface-cli login`
- Check disk space (need ~6.5GB)
- Verify internet connection

### Out of memory
- Reduce `MAX_MODEL_LEN` in vLLM config
- Use smaller batch sizes
- Consider using CPU-only mode

### Slow inference
- Enable GPU support for vLLM
- Reduce `LLM_MAX_TOKENS`
- Use tensor parallelism for multi-GPU

## Technical Details

- **Embedding Model**: all-MiniLM-L6-v2 (384 dimensions)
- **LLM**: Llama 3.2 3B Instruct (8-bit quantization)
- **Chunking**: 512 tokens with 128 token overlap
- **Vector Distance**: Cosine similarity
- **Context Window**: 8192 tokens

## License

See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## Support

For issues and questions, please open a GitHub issue.
