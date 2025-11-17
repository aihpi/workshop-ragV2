// API client for RAG backend
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
  prompt?: string;
}

export interface RetrievedChunk {
  content: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  score: number;
  metadata?: Record<string, any>;
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
  first_query?: string;
}

export interface ChatMessage {
  timestamp: string;
  query: string;
  answer: string;
  chunks: RetrievedChunk[];
  versions?: string[];
  versions_chunks?: RetrievedChunk[][];
  messages_per_version?: any[][];
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description: string;
  isActive: boolean;
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
export const searchDocuments = async (query: string, topK: number = 10, scoreThreshold: number = 0.0): Promise<RetrievedChunk[]> => {
  const response = await api.get('/query/search', {
    params: {
      query,
      top_k: topK,
      score_threshold: scoreThreshold
    }
  });
  return response.data.chunks || [];
};

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
  const baseUrl = API_BASE_URL || window.location.origin;
  const url = `${baseUrl}/api/v1/query/query/stream?${new URLSearchParams({
    query: request.query,
    top_k: String(request.top_k || 5),
    temperature: String(request.temperature || 0.7),
    max_tokens: String(request.max_tokens || 512),
    top_p: String(request.top_p || 0.9),
    top_k_sampling: String(request.top_k_sampling || 40),
    use_chat_history: String(request.use_chat_history || false),
    ...(request.chat_id && { chat_id: request.chat_id }),
    ...(request.prompt && { prompt: request.prompt }),
  })}`;
  
  console.log('Connecting to EventSource:', url);
  const eventSource = new EventSource(url);

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

export const updateChatMessage = async (
  sessionId: string, 
  messageIndex: number,
  versions?: string[],
  versionsChunks?: RetrievedChunk[][],
  messagesPerVersion?: any[][]
) => {
  const response = await api.put(`/chat/${sessionId}/message/${messageIndex}`, {
    versions,
    versions_chunks: versionsChunks,
    messages_per_version: messagesPerVersion
  });
  return response.data;
};

// Prompt APIs
export const getPrompts = async (): Promise<PromptTemplate[]> => {
  try {
    const response = await api.get('/prompts');
    return response.data.prompts;
  } catch (error) {
    // If endpoint doesn't exist yet, return empty array
    console.warn('Prompts API not available, using local state');
    return [];
  }
};

export const savePrompts = async (prompts: PromptTemplate[]) => {
  try {
    const response = await api.post('/prompts', { prompts });
    return response.data;
  } catch (error) {
    // If endpoint doesn't exist yet, just log the warning
    console.warn('Prompts API not available, changes will not persist');
    throw error;
  }
};

export const getActivePrompt = async (): Promise<PromptTemplate | null> => {
  try {
    const response = await api.get('/prompts/active');
    return response.data.prompt;
  } catch (error) {
    console.warn('Active prompt API not available');
    return null;
  }
};

// Model Management Types and Functions
export interface ModelInfo {
  id: string;
  name: string;
  downloaded: boolean;
  active: boolean;
  size?: string;
  gated?: boolean;
}

export interface DownloadProgress {
  model_id: string;
  progress: number;
  status: 'downloading' | 'completed' | 'error';
  message?: string;
}

export const getAvailableModels = async (): Promise<ModelInfo[]> => {
  try {
    const response = await api.get('/models');
    return response.data.models;
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
};

export const downloadModel = async (modelId: string, hfToken?: string): Promise<boolean> => {
  try {
    await api.post('/models/download', { 
      model_id: modelId,
      hf_token: hfToken 
    });
    return true;
  } catch (error) {
    console.error('Error downloading model:', error);
    return false;
  }
};

export const setActiveModel = async (modelId: string): Promise<boolean> => {
  try {
    await api.post('/models/set-active', { model_id: modelId });
    return true;
  } catch (error) {
    console.error('Error setting active model:', error);
    return false;
  }
};

export const deleteModel = async (modelId: string): Promise<boolean> => {
  try {
    await api.post('/models/delete', { model_id: modelId });
    return true;
  } catch (error) {
    console.error('Error deleting model:', error);
    return false;
  }
};

export const getDownloadProgress = async (modelId: string): Promise<DownloadProgress | null> => {
  try {
    const response = await api.get(`/models/download-progress/${modelId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching download progress:', error);
    return null;
  }
};

export default api;
