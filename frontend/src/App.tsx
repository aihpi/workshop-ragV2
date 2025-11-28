import { useState, useEffect } from 'react';
import DocumentUploadModal from './components/DocumentUploadModal';
import RAGChat from './components/RAGChat';
import RetrievedPassages from './components/RetrievedPassages';
import LLMChat from './components/LLMChat';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import MainWindow from './components/MainWindow';
import ModelSelector from './components/ModelSelector';
import { theme } from './theme';
import { 
  getPrompts, 
  savePrompts,
  createChatSession, 
  listChatSessions, 
  getChatHistory, 
  deleteChatSession,
  ChatSession 
} from './services/api';
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
  // View state
  const [activeView, setActiveView] = useState<'chat' | 'settings'>('chat');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [chatHistoryEnabled, setChatHistoryEnabled] = useState(true);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [retrievalModeEnabled, setRetrievalModeEnabled] = useState(false);
  const [graphRagEnabled, setGraphRagEnabled] = useState(false);
  const [graphRagStrategy, setGraphRagStrategy] = useState<'none' | 'merge' | 'pre_filter' | 'post_enrich'>('merge');
  
  // Chat session state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
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

  // Get active prompt for RAG queries
  const activePrompt = prompts.find(p => p.isActive);

  // Handle prompt updates
  const handlePromptsChange = async (newPrompts: PromptTemplate[]) => {
    setPrompts(newPrompts);
    try {
      await savePrompts(newPrompts);
    } catch (error) {
      console.warn('Failed to save prompts to backend');
    }
  };

  // Load chat sessions
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await listChatSessions();
        setChatSessions(sessions);
        
        // Only create initial session if there are no sessions at all and no current session
        if (!currentSessionId && sessions.length === 0) {
          const newSessionId = await createChatSession();
          setCurrentSessionId(newSessionId);
        }
      } catch (error) {
        console.warn('Failed to load chat sessions', error);
      }
    };
    if (chatHistoryEnabled) {
      loadSessions();
    }
  }, [chatHistoryEnabled, currentSessionId]);

  // Sidebar handlers
  const handleNewChat = async () => {
    if (chatHistoryEnabled) {
      // Check if we have any messages in the current chat
      const hasMessages = ragEnabled ? ragChatState.messages.length > 0 : llmChatState.messages.length > 0;
      
      if (hasMessages) {
        // If we have messages but no session, create one first to save current chat
        if (!currentSessionId) {
          try {
            const newSessionId = await createChatSession();
            setCurrentSessionId(newSessionId);
            // Note: Messages are automatically saved during queries via backend
            // Reload sessions list to show the new session
            const sessions = await listChatSessions();
            setChatSessions(sessions);
          } catch (error) {
            console.error('Error creating session for current chat:', error);
          }
        }
      }
      
      // Now create a new session for the new chat
      try {
        const newSessionId = await createChatSession();
        setCurrentSessionId(newSessionId);
        // Reload sessions list
        const sessions = await listChatSessions();
        setChatSessions(sessions);
        // Clear current chat
        setRagChatState(prev => ({
          ...prev,
          messages: [],
          currentAnswer: '',
          currentChunks: [],
        }));
        setLlmChatState(prev => ({
          ...prev,
          messages: [],
          currentAnswer: '',
        }));
      } catch (error) {
        console.error('Error creating new chat:', error);
      }
    } else {
      // Just clear current chat if history is disabled
      setRagChatState(prev => ({
        ...prev,
        messages: [],
        currentAnswer: '',
        currentChunks: [],
      }));
      setLlmChatState(prev => ({
        ...prev,
        messages: [],
        currentAnswer: '',
      }));
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    try {
      const history = await getChatHistory(sessionId);
      setCurrentSessionId(sessionId);
      
      // Build message list from history
      // If a message has versions, only show it (not the messages after it)
      // The messages after it are stored in messagesPerVersion and shown via navigation
      const messages: any[] = [];
      
      for (let i = 0; i < history.length; i++) {
        const msg = history[i];
        
        // Add user query
        messages.push({
          id: `${msg.timestamp}-user`,
          type: 'user' as const,
          content: msg.query,
          timestamp: new Date(msg.timestamp),
        });
        
        // Add assistant response
        const assistantMsg: any = {
          id: `${msg.timestamp}-assistant`,
          type: 'assistant' as const,
          content: msg.answer,
          chunks: msg.chunks,
          timestamp: new Date(msg.timestamp),
        };
        
        // Restore version information if it exists
        if (msg.versions) {
          assistantMsg.versions = msg.versions;
          assistantMsg.versionsChunks = msg.versions_chunks || [];
          assistantMsg.currentVersionIndex = msg.versions.length - 1; // Default to latest version
          
          // Convert message snapshots from plain objects back to Message format
          if (msg.messages_per_version) {
            assistantMsg.messagesPerVersion = msg.messages_per_version.map(
              (versionMessages: any[]) => versionMessages.map((snapMsg: any) => {
                const msgType = snapMsg.query ? 'user' : 'assistant';
                return {
                  id: snapMsg.timestamp ? `${snapMsg.timestamp}-${msgType}` : `snap-${Math.random()}`,
                  type: msgType as 'user' | 'assistant',
                  content: snapMsg.query || snapMsg.answer || '',
                  chunks: snapMsg.chunks || [],
                  timestamp: new Date(snapMsg.timestamp || Date.now()),
                };
              })
            );
          } else {
            assistantMsg.messagesPerVersion = [];
          }
          
          // For the latest version, add the messages from the snapshot
          const latestVersionIndex = msg.versions.length - 1;
          const messagesForLatestVersion = assistantMsg.messagesPerVersion[latestVersionIndex] || [];
          messages.push(assistantMsg);
          messages.push(...messagesForLatestVersion);
          
          // Skip the rest since this message controls what comes after
          break;
        } else {
          messages.push(assistantMsg);
        }
      }

      if (ragEnabled) {
        setRagChatState(prev => ({
          ...prev,
          messages,
          currentAnswer: '',
          currentChunks: [],
        }));
      } else {
        setLlmChatState(prev => ({
          ...prev,
          messages,
          currentAnswer: '',
        }));
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteChatSession(sessionId);
      setChatSessions(prev => prev.filter(s => s.session_id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        handleNewChat();
      }
    } catch (error) {
      console.error('Error deleting chat session:', error);
    }
  };

  // Callback to refresh sessions list (called after sending messages)
  const refreshSessions = async () => {
    if (chatHistoryEnabled) {
      try {
        const sessions = await listChatSessions();
        setChatSessions(sessions);
      } catch (error) {
        console.warn('Failed to refresh chat sessions');
      }
    }
  };

  return (
    <div style={{ 
      display: 'flex',
      height: '100vh',
      fontFamily: theme.fonts.family,
      backgroundColor: theme.colors.white,
      color: theme.colors.text.primary,
      overflow: 'hidden',
    }}>
      {activeView === 'settings' ? (
        // Settings View with its own sidebar
        <Settings 
          onBackToChat={() => setActiveView('chat')}
          prompts={prompts}
          setPrompts={handlePromptsChange}
        />
      ) : (
        <>
          {/* Sidebar */}
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            onNewChat={handleNewChat}
            onSettingsClick={() => setActiveView('settings')}
            chatHistoryEnabled={chatHistoryEnabled}
            onChatHistoryToggle={setChatHistoryEnabled}
            ragEnabled={ragEnabled}
            onRagToggle={setRagEnabled}
            retrievalModeEnabled={retrievalModeEnabled}
            onRetrievalModeToggle={setRetrievalModeEnabled}
            graphRagEnabled={graphRagEnabled}
            onGraphRagToggle={setGraphRagEnabled}
            graphRagStrategy={graphRagStrategy}
            onGraphRagStrategyChange={setGraphRagStrategy}
            chatSessions={chatSessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
          />

          {/* Main Window */}
          <MainWindow
            headerContent={
              !retrievalModeEnabled ? (
                <ModelSelector onModelChange={(modelId) => console.log('Model changed:', modelId)} />
              ) : null
            }
          >
            {retrievalModeEnabled ? (
              // Retrieval Mode View
              <RetrievedPassages 
                ragChatState={ragChatState}
                setRagChatState={setRagChatState}
              />
            ) : ragEnabled ? (
              // RAG Chat View
              <RAGChat
                activePrompt={activePrompt}
                chatState={ragChatState}
                setChatState={setRagChatState}
                currentSessionId={currentSessionId}
                onMessageSent={refreshSessions}
                graphRagEnabled={graphRagEnabled}
                graphRagStrategy={graphRagEnabled ? graphRagStrategy : 'none'}
              />
            ) : (
              // LLM Chat View (RAG disabled)
              <LLMChat
                chatState={llmChatState}
                setChatState={setLlmChatState}
                currentSessionId={currentSessionId}
                onMessageSent={refreshSessions}
              />
            )}
          </MainWindow>
        </>
      )}

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
