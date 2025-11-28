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
  graph_rag_strategy?: 'none' | 'merge' | 'pre_filter' | 'post_enrich';
  graph_depth?: number;
}

export interface RetrievedChunk {
  content: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  score: number;
  metadata?: Record<string, any>;
  // Graph RAG enriched fields
  entity_id?: string;
  entity_type?: string;
  bookmark_id?: string;
  glossary_term_ids?: string[];
  source?: 'vector_search' | 'graph_search' | 'graph_enrichment';
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
    graph_rag_strategy: request.graph_rag_strategy || 'none',
    ...(request.graph_depth && { graph_depth: String(request.graph_depth) }),
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
  downloading?: boolean;  // True if download is in progress
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

export interface SetActiveModelResponse {
  status: 'ready' | 'loading' | 'error';
  message?: string;
}

export const setActiveModel = async (modelId: string): Promise<SetActiveModelResponse> => {
  try {
    const response = await api.post('/models/set-active', { model_id: modelId });
    return response.data;
  } catch (error) {
    console.error('Error setting active model:', error);
    return { status: 'error', message: 'Failed to switch model' };
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

// XML Processing APIs
export interface XMLProcessingOptions {
  preset_name?: string;
  chunk_size?: number;
  chunk_overlap?: number;
  extract_glossary?: boolean;
  track_discontinued?: boolean;
  store_bookmark_ids?: boolean;
  glossary_linking?: string;
  create_graph?: boolean;
  collection_name?: string;
}

export interface XMLJob {
  job_id: string;
  filename: string;
  file_path: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total_chunks: number;
  completed_chunks: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  options?: XMLProcessingOptions;
  preset_name?: string;
  total_nodes?: number;
  total_relationships?: number;
}

export interface XMLPreset {
  name: string;
  description: string;
  entity_patterns: Record<string, string>;
  schicht_mapping: Record<string, string>;
  role_patterns: string[];
  glossary_linking: string;
  extract_glossary: boolean;
  track_discontinued: boolean;
  store_bookmark_ids: boolean;
}

export interface GraphSettings {
  neo4j_uri: string;
  default_depth: number;
  max_depth: number;
  job_retention_days: number;
  neo4j_connected: boolean;
}

export const getXMLPresets = async (): Promise<XMLPreset[]> => {
  try {
    const response = await api.get('/xml/presets');
    return response.data.presets;
  } catch (error) {
    console.error('Error fetching XML presets:', error);
    return [];
  }
};

export const processXMLFile = async (filePath: string, options?: XMLProcessingOptions): Promise<{ job_id: string; status: string; message: string }> => {
  const response = await api.post('/xml/process', {
    file_path: filePath,
    options: options || {}
  });
  return response.data;
};

export const uploadXMLFile = async (
  file: File, 
  options?: Partial<XMLProcessingOptions>
): Promise<{ job_id: string; filename: string; status: string; message: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const params = new URLSearchParams();
  if (options?.chunk_size) params.set('chunk_size', String(options.chunk_size));
  if (options?.chunk_overlap) params.set('chunk_overlap', String(options.chunk_overlap));
  if (options?.extract_glossary !== undefined) params.set('extract_glossary', String(options.extract_glossary));
  if (options?.track_discontinued !== undefined) params.set('track_discontinued', String(options.track_discontinued));
  if (options?.store_bookmark_ids !== undefined) params.set('store_bookmark_ids', String(options.store_bookmark_ids));
  if (options?.create_graph !== undefined) params.set('create_graph', String(options.create_graph));
  
  const response = await api.post(`/xml/upload?${params.toString()}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getXMLJobs = async (): Promise<{ jobs: XMLJob[]; total: number; resumable_count: number }> => {
  const response = await api.get('/xml/jobs');
  return response.data;
};

export const getXMLJobStatus = async (jobId: string): Promise<XMLJob> => {
  const response = await api.get(`/xml/jobs/${jobId}`);
  return response.data;
};

export const resumeXMLJob = async (jobId: string): Promise<{ job_id: string; status: string; message: string }> => {
  const response = await api.post(`/xml/jobs/${jobId}/resume`);
  return response.data;
};

export const cancelXMLJob = async (jobId: string): Promise<{ job_id: string; status: string; message: string }> => {
  const response = await api.post(`/xml/jobs/${jobId}/cancel`);
  return response.data;
};

export const deleteXMLJob = async (jobId: string): Promise<{ job_id: string; message: string }> => {
  const response = await api.delete(`/xml/jobs/${jobId}`);
  return response.data;
};

export const getXMLJob = async (jobId: string): Promise<XMLJob> => {
  const response = await api.get(`/xml/jobs/${jobId}`);
  return response.data;
};

export const getResumableJobs = async (): Promise<{ jobs: any[]; count: number }> => {
  const response = await api.get('/xml/jobs/resumable');
  return response.data;
};

export const getGraphSettings = async (): Promise<GraphSettings> => {
  const response = await api.get('/xml/settings');
  return response.data;
};

export const updateGraphSettings = async (settings: Partial<GraphSettings>): Promise<GraphSettings> => {
  const response = await api.put('/xml/settings', settings);
  return response.data;
};

export const deleteDocumentFromGraph = async (documentId: string): Promise<{ deleted_nodes: number; message: string }> => {
  const response = await api.delete(`/xml/graph/document/${documentId}`);
  return response.data;
};

// Graph exploration APIs
export interface GraphNode {
  id: string;
  type: string;
  title: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  source_id: string;
  target_id: string;
  relationship_type: string;
  properties: Record<string, any>;
}

export interface GraphExplorationResult {
  center_node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth_reached: number;
}

export const exploreGraph = async (
  nodeId: string, 
  depth?: number, 
  relationshipTypes?: string[]
): Promise<GraphExplorationResult> => {
  const params = new URLSearchParams();
  if (depth) params.set('depth', String(depth));
  if (relationshipTypes) params.set('relationship_types', relationshipTypes.join(','));
  
  const response = await api.get(`/query/graph/explore/${nodeId}?${params.toString()}`);
  return response.data;
};

export const getGraphStats = async (): Promise<{
  total_nodes: number;
  total_relationships: number;
  total_documents: number;
  nodes_by_type: Record<string, number>;
  relationships_by_type: Record<string, number>;
}> => {
  const response = await api.get('/query/graph/stats');
  return response.data;
};

// SSE for job progress
export const streamJobProgress = (
  jobId: string,
  onProgress: (data: {
    job_id: string;
    stage: string;
    progress: number;
    message: string;
    items_completed: number;
    items_total: number;
    error?: string;
  }) => void,
  onComplete: () => void,
  onError: (error: string) => void
): EventSource => {
  const baseUrl = API_BASE_URL || window.location.origin;
  const url = `${baseUrl}/api/v1/xml/jobs/${jobId}/stream`;
  
  const eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
      
      if (data.stage === 'completed' || data.stage === 'failed' || data.stage === 'cancelled') {
        onComplete();
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

export default api;
