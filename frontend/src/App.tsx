import { useState, useEffect } from 'react';
import DocumentUploadModal from './components/DocumentUploadModal';
import RAGChat from './components/RAGChat';
import PromptManagement from './components/PromptManagement';
import RetrievedPassages from './components/RetrievedPassages';
import LLMChat from './components/LLMChat';
import QueryTransformations from './components/QueryTransformations';
import Settings from './components/Settings';
import { getPrompts, savePrompts } from './services/api';
import './index.css';

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description: string;
  isActive: boolean;
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  chunks?: any[];
  timestamp: Date;
}

interface RAGChatState {
  messages: Array<{
    id: string;
    type: 'user' | 'assistant';
    content: string;
    chunks?: any[];
    timestamp: Date;
  }>;
  query: string;
  isStreaming: boolean;
  showParameters: boolean;
  currentChunks: any[];
  currentAnswer: string;
  enableChatHistory: boolean;
  maxTokens: number;
  relevanceThreshold: number;
  topN: number;
  topK: number;
  temperature: number;
  topP: number;
}

interface LLMChatState {
  messages: Array<{
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  query: string;
  isStreaming: boolean;
  showParameters: boolean;
  currentAnswer: string;
  maxTokens: number;
  topK: number;
  temperature: number;
  topP: number;
}

function App() {
  const [activeTab, setActiveTab] = useState('rag-chat');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  // Shared prompt state
  const [prompts, setPrompts] = useState<PromptTemplate[]>([
    {
      id: '1',
      name: 'Default RAG Prompt',
      template: `SYSTEM:
You are a precise and reliable assistant. 
You answer based only on the provided retrieved context and, if available, conversation history. 
If the answer is not clearly supported by the context, say: 
"I don't know based on the available information."

When you use information from the context, cite it using bracket references like: [doc:chunk].

Maintain consistency with previous answers. Avoid guessing, speculation, or adding external facts.

---

CONVERSATION HISTORY (optional):
{history}

---

CONTEXT (retrieved passages):
{context}

---

USER QUESTION:
{query}

---

ASSISTANT ANSWER:`,
      description: 'Standard RAG prompt with context and question placeholders',
      isActive: true
    },
    {
      id: '2',
      name: 'New Prompt',
      template: `You are a helpful assistant. Answer the question below based on the provided context and chat history.

Context:
{context}

Chat history:
{history}

Question: 
{question}

Answer:`,
      description: 'New prompt template',
      isActive: false
    }
  ]);

  // Persistent RAG Chat state
  const [ragChatState, setRagChatState] = useState<RAGChatState>({
    messages: [],
    query: '',
    isStreaming: false,
    showParameters: false,
    currentChunks: [],
    currentAnswer: '',
    enableChatHistory: true,
    maxTokens: 300,
    relevanceThreshold: 0.7,
    topN: 5,
    topK: 40,
    temperature: 0.3,
    topP: 0.9,
  });

  // Persistent LLM Chat state
  const [llmChatState, setLlmChatState] = useState<LLMChatState>({
    messages: [],
    query: '',
    isStreaming: false,
    showParameters: false,
    currentAnswer: '',
    maxTokens: 300,
    topK: 40,
    temperature: 0.7,
    topP: 0.9,
  });

  // Load prompts from backend on mount
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const backendPrompts = await getPrompts();
        if (backendPrompts.length > 0) {
          setPrompts(backendPrompts);
        }
      } catch (error) {
        console.warn('Failed to load prompts from backend, using defaults');
      }
    };
    loadPrompts();
  }, []);

  // Save prompts to backend when they change
  const handlePromptsChange = async (newPrompts: PromptTemplate[]) => {
    setPrompts(newPrompts);
    try {
      await savePrompts(newPrompts);
    } catch (error) {
      console.warn('Failed to save prompts to backend');
    }
  };

  // Get active prompt for RAG queries
  const activePrompt = prompts.find(p => p.isActive);

  const tabs = [
    { id: 'rag-chat', label: 'RAG Chat' },
    { id: 'prompt-management', label: 'Prompt Management' },
    { id: 'retrieved-passages', label: 'Retrieved Passages' },
    { id: 'llm-chat', label: 'LLM Chat' },
    { id: 'query-transformations', label: 'Query Transformations' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#ffffff',
      color: '#333333'
    }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        padding: '0 16px',
        overflowX: 'auto'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              color: activeTab === tab.id ? '#007bff' : '#666666',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid #007bff' : '2px solid transparent',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ 
        flex: 1, 
        padding: '24px',
        backgroundColor: '#ffffff',
        paddingBottom: '24px'
      }}>
        {activeTab === 'rag-chat' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 8px 0' }}>RAG Chat</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                  Chat with your documents using retrieval-augmented generation. Upload documents first if you haven't already.
                </p>
                <button
                  onClick={() => setRagChatState(prev => ({ 
                    ...prev, 
                    messages: [], 
                    currentAnswer: '', 
                    isStreaming: false 
                  }))}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Clear History
                </button>
              </div>
            </div>
            <div>
              <RAGChat 
                activePrompt={activePrompt} 
                chatState={ragChatState}
                setChatState={setRagChatState}
              />
            </div>
          </div>
        )}

        {activeTab === 'prompt-management' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 8px 0' }}>Prompt Management</h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                Create and manage prompt templates for RAG queries. Edit templates and set which one is active for chat responses.
              </p>
            </div>
            <div>
              <PromptManagement prompts={prompts} setPrompts={handlePromptsChange} />
            </div>
          </div>
        )}

        {activeTab === 'retrieved-passages' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 8px 0' }}>Retrieved Passages</h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                Search and examine document passages retrieved by the vector database.
              </p>
            </div>
            <div>
              <RetrievedPassages />
            </div>
          </div>
        )}

        {activeTab === 'llm-chat' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 8px 0' }}>LLM Chat</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                  Direct chat with the language model without document retrieval.
                </p>
                <button
                  onClick={() => setLlmChatState(prev => ({ 
                    ...prev, 
                    messages: [], 
                    currentAnswer: '', 
                    isStreaming: false 
                  }))}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Clear History
                </button>
              </div>
            </div>
            <div>
              <LLMChat 
                chatState={llmChatState}
                setChatState={setLlmChatState}
              />
            </div>
          </div>
        )}

        {activeTab === 'query-transformations' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 8px 0' }}>Query Transformations</h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                Analyze and transform user queries before processing them through the RAG pipeline.
              </p>
            </div>
            <div>
              <QueryTransformations />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 8px 0' }}>Settings</h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                Configure the RAG system settings and preferences.
              </p>
            </div>
            <div>
              <Settings />
            </div>
          </div>
        )}
      </div>

      {/* Floating Upload Button */}
      <button
        onClick={() => setIsUploadModalOpen(true)}
        style={{
          position: 'fixed',
          bottom: '84px',
          right: '24px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          fontWeight: 'bold'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#0056b3';
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#007bff';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title="Upload Documents"
      >
        +
      </button>

      {/* Banner at bottom */}
      <div style={{
        padding: '24px 48px',
        backgroundColor: '#f8f9fa',
        borderTop: '1px solid #dee2e6',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <img 
          src="/img/logo_aisc_bmftr.jpg" 
          alt="AI Service Center Banner"
          style={{
            maxHeight: '120px',
            height: 'auto',
            objectFit: 'contain'
          }}
        />
      </div>

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onDocumentsChange={() => {}}
      />
    </div>
  );
}

export default App;
