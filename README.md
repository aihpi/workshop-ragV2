# RAG Tool - Retrieval-Augmented Generation

An educational RAG (Retrieval-Augmented Generation) system with a FastAPI backend, React frontend, Qdrant vector database, and Ollama for inference.

![Logo](img/logo_aisc_bmftr.jpg)

## Features

- **Document Management**: Upload and process PDF, DOCX, TXT, MD, HTML, and XML files
- **Vector Search**: Semantic search using Qdrant and SentenceTransformers
- **RAG Query**: Answer questions based on document content
- **Streaming Responses**: Real-time token streaming using Server-Sent Events
- **Chat History**: Persistent chat sessions with conversation context
- **Multiple Interfaces**: Web UI with specialized settings
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
                    │    Ollama    │
                    │   (Qwen)     │
                    │  Port 11434  │
                    └──────────────┘
```

## Quick Start

### Prerequisites

- **Ollama** (required): Install from https://ollama.com
  ```bash
  # Linux
  curl -fsSL https://ollama.com/install.sh | sh
  
  # macOS
  brew install ollama
  ```
- Python 3.10+ (for native installation)
- Node.js 18+ (for native installation)
- Docker (for containerized deployment)
- 16GB+ RAM recommended

### Installation

#### Method 1: Docker (Recommended)

Pull pre-built images from GitHub Container Registry:

```bash
# Start Ollama on host
ollama serve &
ollama pull qwen2.5:7b-instruct

# Clone repository
git clone https://github.com/aihpi/workshop-ragV2.git
cd workshop-ragV2

# Start with Docker Compose
docker-compose up -d
```

Visit http://localhost:3000

> **Note**: The backend container connects to Ollama running on your host machine.
> Ollama must be running before starting the containers.

#### Method 2: Automated Setup

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

**2. Install Ollama and Download Model**

```bash
# Install Ollama (Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Pull the default model
ollama pull qwen2.5:7b-instruct
```

**3. Start Services**

Terminal 1 - Qdrant:
```bash
./scripts/start_qdrant.sh
```

Terminal 2 - Ollama:
```bash
ollama serve
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
# Ollama Settings
OLLAMA_HOST=localhost
OLLAMA_PORT=11434
OLLAMA_MODEL=qwen2.5:7b-instruct
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
- Check if Ollama is running: `curl http://localhost:11434/api/tags`
- Verify `.env` configuration

### Model download fails
- Check disk space
- Verify internet connection
- Try: `ollama pull qwen2.5:7b-instruct`

### Out of memory
- Use a smaller model: `ollama pull qwen2.5:3b-instruct`
- Reduce `LLM_MAX_TOKENS` in configuration
- Close other memory-intensive applications

### Slow inference
- Ensure Ollama is using GPU (check with `ollama ps`)
- Reduce `LLM_MAX_TOKENS`
- Use a smaller/faster model

## Technical Details

- **Embedding Model**: all-MiniLM-L6-v2 (384 dimensions)
- **LLM**: Qwen 2.5 7B Instruct (via Ollama)
- **Chunking**: 512 tokens with 128 token overlap
- **Vector Distance**: Cosine similarity
- **LLM Backend**: Ollama (port 11434)

## Docker Images

Pre-built images are available on GitHub Container Registry:

```bash
# Pull images
docker pull ghcr.io/aihpi/workshop-ragv2-backend:latest
docker pull ghcr.io/aihpi/workshop-ragv2-frontend:latest

# Or use docker-compose (automatically pulls)
docker-compose pull
docker-compose up -d
```

### Building Locally

```bash
docker-compose build
docker-compose up -d
```

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
