import React, { useRef, useEffect } from 'react';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface LLMChatState {
  messages: Message[];
  query: string;
  isStreaming: boolean;
  showParameters: boolean;
  currentAnswer: string;
  maxTokens: number;
  topK: number;
  temperature: number;
  topP: number;
}

interface LLMChatProps {
  chatState: LLMChatState;
  setChatState: React.Dispatch<React.SetStateAction<LLMChatState>>;
}

const LLMChat: React.FC<LLMChatProps> = ({ chatState, setChatState }) => {
  // Use persistent state from props
  const {
    messages,
    query,
    isStreaming,
    showParameters,
    currentAnswer,
    maxTokens,
    topK,
    temperature,
    topP,
  } = chatState;

  // Helper functions to update state
  const updateState = (updates: Partial<LLMChatState>) => {
    setChatState(prev => ({ ...prev, ...updates }));
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
      query: ''
    });

    const assistantMessageId = (Date.now() + 1).toString();

    let finalAnswer = '';
    
    // Direct LLM API call (bypassing RAG)
    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_URL || 'http://localhost:8005'}/api/v1/query/llm/stream?${new URLSearchParams({
        query: query,
        temperature: String(temperature),
        max_tokens: String(maxTokens),
        top_p: String(topP),
        top_k: String(topK),
      })}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'token') {
          finalAnswer += data.token;
          setChatState(prev => ({
            ...prev,
            currentAnswer: finalAnswer
          }));
        } else if (data.type === 'done') {
          // add the complete assistant message
          const finalMessage: Message = {
            id: assistantMessageId,
            type: 'assistant',
            content: finalAnswer,
            timestamp: new Date(),
          };
          
          setChatState(prev => ({
            ...prev,
            messages: [...prev.messages, finalMessage],
            currentAnswer: '',
            isStreaming: false
          }));
          eventSource.close();
        } else if (data.type === 'error') {
          console.error('LLM streaming error:', data.error);
          // add error message
          const errorMessage: Message = {
            id: assistantMessageId,
            type: 'assistant',
            content: `[Error] ${data.error}`,
            timestamp: new Date(),
          };
          
          setChatState(prev => ({
            ...prev,
            messages: [...prev.messages, errorMessage],
            isStreaming: false,
            currentAnswer: ''
          }));
          eventSource.close();
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = () => {
      console.error('LLM Connection error');
      // add connection error message
      const errorMessage: Message = {
        id: assistantMessageId,
        type: 'assistant',
        content: '[Error] Connection error',
        timestamp: new Date(),
      };
      
      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        isStreaming: false,
        currentAnswer: ''
      }));
      eventSource.close();
    };
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
        marginBottom: '16px',
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
                color: message.type === 'user' ? '#2563eb' : '#7c3aed'
              }}>
                {message.type === 'user' ? 'User:' : 'LLM:'}
              </span>
              <span>{message.timestamp.toLocaleTimeString()}</span>
            </div>
            <div style={{ 
              padding: '12px',
              backgroundColor: message.type === 'user' ? '#e3f2fd' : '#f3e5f5',
              borderRadius: '8px',
              marginLeft: '24px',
              color: '#333333'
            }}>
              {message.content}
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
                color: '#7c3aed'
              }}>
                LLM:
              </span>
              <span>Generating...</span>
            </div>
            <div style={{ 
              padding: '12px',
              backgroundColor: '#f3e8ff',
              borderRadius: '8px',
              marginLeft: '24px'
            }}>
              {currentAnswer}
              <span style={{ animation: 'blink 1s infinite' }}>|</span>
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
            placeholder="Ask the LLM anything... (Enter to send, Ctrl+Enter for new line)"
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
              backgroundColor: isStreaming ? '#ccc' : '#7c3aed',
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
      <div style={{ borderTop: '1px solid #ddd', paddingTop: '16px' }}>
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
            backgroundColor: '#f9fafb',
            borderRadius: '8px'
          }}>
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

export default LLMChat;