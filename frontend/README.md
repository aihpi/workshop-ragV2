# RAG Frontend

React frontend for the RAG tool built with Vite and TypeScript.

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Development

The frontend will be available at http://localhost:3000

## Features

- **Upload Documents**: Upload and manage documents
- **Query Documents**: Ask questions with streaming responses
- **Settings**: Configure API and default parameters

## Configuration

Create a `.env` file:

```bash
VITE_API_URL=http://localhost:8000
```

## API Integration

The frontend communicates with the backend through the API service in `src/services/api.ts`.

- Document upload and management
- Streaming RAG queries using Server-Sent Events
- Chat history management (coming soon)
