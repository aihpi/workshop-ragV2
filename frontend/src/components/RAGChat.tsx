import React, { useRef, useEffect } from 'react';
import { queryRAGStream, RetrievedChunk } from '../services/api';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  chunks?: RetrievedChunk[];
  timestamp: Date;
}

interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description: string;
  isActive: boolean;
}

interface RAGChatState {
  messages: Message[];
  query: string;
  isStreaming: boolean;
  showParameters: boolean;
  currentChunks: RetrievedChunk[];
  currentAnswer: string;
  enableChatHistory: boolean;
  maxTokens: number;
  relevanceThreshold: number;
  topN: number;
  topK: number;
  temperature: number;
  topP: number;
}

interface RAGChatProps {
  activePrompt?: PromptTemplate;
  chatState: RAGChatState;
  setChatState: React.Dispatch<React.SetStateAction<RAGChatState>>;
}

const RAGChat: React.FC<RAGChatProps> = ({ activePrompt, chatState, setChatState }) => {
  // Use persistent state from props
  const {
    messages,
    query,
    isStreaming,
    showParameters,
    currentChunks,
    currentAnswer,
    enableChatHistory,
    maxTokens,
    relevanceThreshold,
    topN,
    topK,
    temperature,
    topP,
  } = chatState;

  // Helper functions to update state
  const updateState = (updates: Partial<RAGChatState>) => {
    setChatState(prev => ({ ...prev, ...updates }));
  };

  const resetChat = () => {
    updateState({
      messages: [],
      currentAnswer: '',
      currentChunks: [],
      isStreaming: false
    });
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentAnswer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: query,
      timestamp: new Date(),
    };

    updateState({
      messages: [...messages, userMessage],
      isStreaming: true,
      currentAnswer: '',
      currentChunks: [],
      query: ''
    });

    const assistantMessageId = (Date.now() + 1).toString();

    let finalAnswer = '';
    let finalChunks: RetrievedChunk[] = [];
    queryRAGStream(
      {
        query,
        top_k: topN,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        top_k_sampling: topK,
        use_chat_history: enableChatHistory,
        prompt: activePrompt?.template,
      },
      (token) => {
        finalAnswer += token;
        setChatState(prev => ({
          ...prev,
          currentAnswer: finalAnswer
        }));
      },
      (chunks) => {
        finalChunks = chunks;
        setChatState(prev => ({ ...prev, currentChunks: chunks }));
      },
      () => {
        // finalize: add the complete assistant message
        const finalMessage: Message = {
          id: assistantMessageId,
          type: 'assistant',
          content: finalAnswer,
          chunks: finalChunks,
          timestamp: new Date(),
        };
        
        setChatState(prev => ({
          ...prev,
          messages: [...prev.messages, finalMessage],
          currentAnswer: '',
          currentChunks: [],
          isStreaming: false
        }));
      },
      (error) => {
        console.error('Streaming error:', error);
        // add error message instead of updating placeholder
        const errorMessage: Message = {
          id: assistantMessageId,
          type: 'assistant',
          content: `[Error] ${error}`,
          timestamp: new Date(),
        };
        
        setChatState(prev => ({
          ...prev,
          messages: [...prev.messages, errorMessage],
          isStreaming: false,
          currentAnswer: '',
          currentChunks: []
        }));
      }
    );

    updateState({ query: '' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Chat History Box */}
      <div style={{ 
        minHeight: '400px',
        maxHeight: '600px', 
        border: '1px solid #dee2e6', 
        borderRadius: '8px', 
        padding: '16px', 
        overflowY: 'auto',
        backgroundColor: '#f8f9fa'
      }}>
        {messages.map((message) => (
          <div key={message.id} style={{ marginBottom: '16px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginBottom: '8px',
              fontSize: '14px',
              color: '#666'
            }}>
              <span style={{ 
                marginRight: '8px',
                fontWeight: 'bold',
                color: message.type === 'user' ? '#2563eb' : '#059669'
              }}>
                {message.type === 'user' ? 'User:' : 'Assistant:'}
              </span>
              <span>{message.timestamp.toLocaleTimeString()}</span>
            </div>
            <div style={{ 
              padding: '12px',
              backgroundColor: message.type === 'user' ? '#e3f2fd' : '#e8f5e8',
              borderRadius: '8px',
              marginLeft: '24px',
              color: '#333333'
            }}>
              {message.content}
              {message.chunks && message.chunks.length > 0 && (
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '12px', 
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  Based on {message.chunks.length} passages
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isStreaming && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginBottom: '8px',
              fontSize: '14px',
              color: '#666'
            }}>
              <span style={{ 
                marginRight: '8px',
                fontWeight: 'bold',
                color: '#059669'
              }}>
                Assistant:
              </span>
              <span>Generating...</span>
            </div>
            <div style={{ 
              padding: '12px',
              backgroundColor: '#f0fdf4',
              borderRadius: '8px',
              marginLeft: '24px'
            }}>
              {currentAnswer}
              <span style={{ animation: 'blink 1s infinite' }}>|</span>
              {currentChunks.length > 0 && (
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '12px', 
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  Based on {currentChunks.length} passages
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Query Input Box */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <textarea
            value={query}
            onChange={(e) => updateState({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                if (!isStreaming && query.trim()) {
                  handleSubmit(e as any);
                }
              }
            }}
            placeholder="Ask a question about your documents... (Enter to send, Ctrl+Enter for new line)"
            rows={3}
            style={{
              flex: 1,
              padding: '12px',
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              resize: 'vertical',
              fontFamily: 'inherit',
              backgroundColor: '#ffffff',
              color: '#333333'
            }}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!query.trim() || isStreaming}
            style={{
              padding: '12px 24px',
              backgroundColor: isStreaming ? '#ccc' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isStreaming ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isStreaming ? 'Generating...' : 'Send'}
          </button>
        </div>
      </form>

      {/* Parameters Panel */}
      <div style={{ borderTop: '1px solid #dee2e6', paddingTop: '16px' }}>
        <button
          onClick={() => updateState({ showParameters: !showParameters })}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            cursor: 'pointer',
            marginBottom: showParameters ? '16px' : '0',
            color: '#333333'
          }}
        >
          {showParameters ? '▼' : '▶'} Parameters
        </button>

        {showParameters && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={enableChatHistory}
                  onChange={(e) => updateState({ enableChatHistory: e.target.checked })}
                />
                Enable Chat History
              </label>
            </div>

            <div>
              <label>Max Tokens: {maxTokens}</label>
              <input
                type="range"
                min="50"
                max="1000"
                step="10"
                value={maxTokens}
                onChange={(e) => updateState({ maxTokens: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Relevance Threshold: {relevanceThreshold}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={relevanceThreshold}
                onChange={(e) => updateState({ relevanceThreshold: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Top N Results: {topN}</label>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={topN}
                onChange={(e) => updateState({ topN: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Top-k: {topK}</label>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={topK}
                onChange={(e) => updateState({ topK: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Temperature: {temperature}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => updateState({ temperature: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Top-p: {topP}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={topP}
                onChange={(e) => updateState({ topP: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
              <button
                type="button"
                onClick={resetChat}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Reset Chat
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default RAGChat;