// API client for RAG backend
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Document {
  document_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  upload_date: string;
  num_chunks: number;
}

export interface QueryRequest {
  query: string;
  top_k?: number;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k_sampling?: number;
  use_chat_history?: boolean;
  chat_id?: string;
}

export interface RetrievedChunk {
  content: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  score: number;
}

export interface QueryResponse {
  query: string;
  answer: string;
  retrieved_chunks: RetrievedChunk[];
  metadata: Record<string, any>;
}

export interface ChatSession {
  session_id: string;
  created_at: string;
  num_messages: number;
}

export interface ChatMessage {
  timestamp: string;
  query: string;
  answer: string;
  chunks: RetrievedChunk[];
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Document APIs
export const uploadDocument = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const listDocuments = async (): Promise<Document[]> => {
  const response = await api.get('/documents/list');
  return response.data.documents;
};

export const deleteDocument = async (documentId: string) => {
  const response = await api.delete(`/documents/${documentId}`);
  return response.data;
};

export const syncDocuments = async () => {
  const response = await api.post('/documents/sync');
  return response.data;
};

// Query APIs
export const queryRAG = async (request: QueryRequest): Promise<QueryResponse> => {
  const response = await api.post('/query/query', request);
  return response.data;
};

export const queryRAGStream = (
  request: QueryRequest,
  onToken: (token: string) => void,
  onChunks: (chunks: RetrievedChunk[]) => void,
  onDone: () => void,
  onError: (error: string) => void
) => {
  const eventSource = new EventSource(
    `${API_BASE_URL}/api/v1/query/query/stream?${new URLSearchParams({
      query: request.query,
      top_k: String(request.top_k || 5),
      temperature: String(request.temperature || 0.7),
      max_tokens: String(request.max_tokens || 512),
      top_p: String(request.top_p || 0.9),
      top_k_sampling: String(request.top_k_sampling || 40),
      use_chat_history: String(request.use_chat_history || false),
      ...(request.chat_id && { chat_id: request.chat_id }),
    })}`
  );

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'chunks') {
        onChunks(data.chunks);
      } else if (data.type === 'token') {
        onToken(data.token);
      } else if (data.type === 'done') {
        onDone();
        eventSource.close();
      } else if (data.type === 'error') {
        onError(data.error);
        eventSource.close();
      }
    } catch (error) {
      console.error('Error parsing SSE data:', error);
    }
  };

  eventSource.onerror = () => {
    onError('Connection error');
    eventSource.close();
  };

  return eventSource;
};

// Chat APIs
export const createChatSession = async (): Promise<string> => {
  const response = await api.post('/chat/new');
  return response.data.session_id;
};

export const listChatSessions = async (): Promise<ChatSession[]> => {
  const response = await api.get('/chat/list');
  return response.data.sessions;
};

export const getChatHistory = async (sessionId: string): Promise<ChatMessage[]> => {
  const response = await api.get(`/chat/${sessionId}`);
  return response.data.history;
};

export const deleteChatSession = async (sessionId: string) => {
  const response = await api.delete(`/chat/${sessionId}`);
  return response.data;
};

export default api;
