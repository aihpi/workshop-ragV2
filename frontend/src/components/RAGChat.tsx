import React, { useRef, useEffect, useState } from 'react';
import { queryRAGStream, RetrievedChunk, updateChatMessage } from '../services/api';
import RetrievedPassagesModal from './RetrievedPassagesModal';
import { theme } from '../theme';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  chunks?: RetrievedChunk[];
  timestamp: Date;
  // For tracking multiple response versions
  versions?: string[]; // Array of response versions
  versionsChunks?: RetrievedChunk[][]; // Chunks for each version
  currentVersionIndex?: number; // Current version being displayed
  messagesPerVersion?: Message[][]; // Complete message list after each version
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
  currentSessionId: string | null;
  onMessageSent?: () => void;
}

const RAGChat: React.FC<RAGChatProps> = ({ activePrompt, chatState, setChatState, currentSessionId, onMessageSent }) => {
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

  // Modal state for retrieved passages
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChunks, setSelectedChunks] = useState<RetrievedChunk[]>([]);

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        chat_id: currentSessionId || undefined,
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
        
        // Refresh sessions list to show updated chat
        if (onMessageSent) {
          onMessageSent();
        }
        
        // Refocus the textarea
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Chat History Box */}
      <div style={{ 
        flex: 1,
        border: '1px solid theme.colors.text.quaternary', 
        borderRadius: '8px', 
        padding: '16px', 
        overflowY: 'auto',
        backgroundColor: 'theme.colors.highlight.quaternary',
        marginBottom: '16px',
      }}>
        {messages.map((message) => (
          <div key={message.id} style={{ 
            marginBottom: '16px',
            display: 'flex',
            justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
          }}>
            <div style={{ 
              padding: '12px',
              borderRadius: '8px',
              color: theme.colors.text.primary,
              backgroundColor: message.type === 'user' ? 'rgba(246, 168, 0, 0.25)' : 'transparent',
              maxWidth: '80%',
              textAlign: message.type === 'user' ? 'right' : 'left'
            }}>
              {message.content}
              
              {/* Action buttons for assistant messages */}
              {message.type === 'assistant' && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.colors.text.quaternary}`, display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* History Navigation Controls */}
                  {message.versions && message.versions.length > 1 && (
                    <>
                      <button
                        onClick={() => {
                          const currentIdx = message.currentVersionIndex || 0;
                          if (currentIdx > 0) {
                            const newIdx = currentIdx - 1;
                            
                            // Get the complete message list for the previous version
                            const messagesForVersion = message.messagesPerVersion?.[newIdx] || [];
                            
                            const updatedMessage = { 
                              ...message, 
                              content: message.versions![newIdx], 
                              chunks: message.versionsChunks?.[newIdx] || [],
                              currentVersionIndex: newIdx 
                            };
                            
                            // Replace entire message list with the snapshot for this version
                            const messageIndex = messages.findIndex(m => m.id === message.id);
                            if (messageIndex === -1) {
                              console.error('Message not found in array');
                              return;
                            }
                            
                            // Reconstruct: messages before this response + updated response + messages from version snapshot
                            const newMessages = [
                              ...messages.slice(0, messageIndex),
                              updatedMessage,
                              ...messagesForVersion
                            ];
                            
                            updateState({ messages: newMessages });
                          }
                        }}
                        disabled={(message.currentVersionIndex || 0) === 0}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: (message.currentVersionIndex || 0) === 0 ? 'not-allowed' : 'pointer',
                          color: (message.currentVersionIndex || 0) === 0 ? theme.colors.text.quaternary : theme.colors.text.secondary,
                          fontSize: '12px',
                          fontWeight: 'bold',
                          transition: 'color 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          if ((message.currentVersionIndex || 0) > 0) {
                            e.currentTarget.style.color = theme.colors.accent.primary;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if ((message.currentVersionIndex || 0) > 0) {
                            e.currentTarget.style.color = theme.colors.text.secondary;
                          }
                        }}
                        data-tooltip="Previous version"
                      >
                        &lt;
                      </button>
                      <span style={{ 
                        fontSize: '12px', 
                        color: theme.colors.text.secondary,
                        fontWeight: 'bold'
                      }}>
                        {(message.currentVersionIndex || 0) + 1}/{message.versions.length}
                      </span>
                      <button
                        onClick={() => {
                          const currentIdx = message.currentVersionIndex || 0;
                          if (currentIdx < message.versions!.length - 1) {
                            const newIdx = currentIdx + 1;
                            const messageIndex = messages.findIndex(m => m.id === message.id);
                            
                            if (messageIndex === -1) {
                              console.error('Message not found in array');
                              return;
                            }
                            
                            // Get the complete message list for the next version
                            const messagesForVersion = message.messagesPerVersion?.[newIdx] || [];
                            
                            const updatedMessage = { 
                              ...message, 
                              content: message.versions![newIdx], 
                              chunks: message.versionsChunks?.[newIdx] || [],
                              currentVersionIndex: newIdx 
                            };
                            
                            // Reconstruct: messages before this response + updated response + messages from version snapshot
                            const newMessages = [
                              ...messages.slice(0, messageIndex),
                              updatedMessage,
                              ...messagesForVersion
                            ];
                            
                            updateState({ messages: newMessages });
                          }
                        }}
                        disabled={(message.currentVersionIndex || 0) >= message.versions.length - 1}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: (message.currentVersionIndex || 0) >= message.versions.length - 1 ? 'not-allowed' : 'pointer',
                          color: (message.currentVersionIndex || 0) >= message.versions.length - 1 ? theme.colors.text.quaternary : theme.colors.text.secondary,
                          fontSize: '12px',
                          fontWeight: 'bold',
                          transition: 'color 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          if ((message.currentVersionIndex || 0) < message.versions!.length - 1) {
                            e.currentTarget.style.color = theme.colors.accent.primary;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if ((message.currentVersionIndex || 0) < message.versions!.length - 1) {
                            e.currentTarget.style.color = theme.colors.text.secondary;
                          }
                        }}
                        data-tooltip="Next version"
                      >
                        &gt;
                      </button>
                      <div style={{ width: '1px', height: '16px', backgroundColor: theme.colors.text.quaternary, margin: '0 4px' }}></div>
                    </>
                  )}
                  
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(message.content);
                    }}
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) (svg as SVGElement).style.stroke = theme.colors.accent.primary;
                    }}
                    onMouseLeave={(e) => {
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) (svg as SVGElement).style.stroke = theme.colors.text.secondary;
                    }}
                    data-tooltip="Copy to clipboard"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.text.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s ease' }}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                  
                  <button
                    onClick={() => {
                      // Find the user message before this assistant message
                      const messageIndex = messages.findIndex(m => m.id === message.id);
                      if (messageIndex > 0) {
                        const previousUserMessage = messages[messageIndex - 1];
                        if (previousUserMessage.type === 'user') {
                          // Save complete message list after this point (for version snapshots)
                          const messagesAfterThis = messages.slice(messageIndex + 1);
                          
                          // Delete all messages after and including this assistant message
                          const newMessages = messages.slice(0, messageIndex);
                          const userQuery = previousUserMessage.content;
                          
                          // Save current response as a version
                          const versions = message.versions || [message.content];
                          const versionsChunks = message.versionsChunks || [message.chunks || []];
                          const messagesPerVersion = message.messagesPerVersion || [messagesAfterThis]; // Version 0 has the original subsequent messages
                          
                          setChatState({
                            ...chatState,
                            messages: newMessages,
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
                              query: userQuery,
                              top_k: topN,
                              temperature,
                              max_tokens: maxTokens,
                              top_p: topP,
                              top_k_sampling: topK,
                              use_chat_history: false, // Don't save as new message, we'll update existing one with versions
                              chat_id: currentSessionId || undefined,
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
                              // Add new response version
                              const newVersions = [...versions, finalAnswer];
                              const newVersionsChunks = [...versionsChunks, finalChunks];
                              const newMessagesPerVersion = [...messagesPerVersion, []]; // New version has no subsequent messages
                              const finalMessage: Message = {
                                id: assistantMessageId,
                                type: 'assistant',
                                content: finalAnswer,
                                chunks: finalChunks,
                                timestamp: new Date(),
                                versions: newVersions,
                                versionsChunks: newVersionsChunks,
                                currentVersionIndex: newVersions.length - 1,
                                messagesPerVersion: newMessagesPerVersion
                              };
                              
                              setChatState(prev => ({
                                ...prev,
                                messages: [...prev.messages, finalMessage],
                                currentAnswer: '',
                                currentChunks: [],
                                isStreaming: false
                              }));
                              
                              // Save version information to backend if chat history is enabled
                              if (enableChatHistory && currentSessionId) {
                                // Calculate message index: we need to find where this assistant message is in the history
                                // It's the number of completed Q&A pairs before this point
                                const messageIndex = Math.floor(newMessages.length / 2);
                                
                                // Convert message snapshots to plain objects (remove React metadata)
                                const messagesPerVersionPlain = newMessagesPerVersion.map(versionMessages => 
                                  versionMessages.map((msg: Message) => ({
                                    query: msg.type === 'user' ? msg.content : undefined,
                                    answer: msg.type === 'assistant' ? msg.content : undefined,
                                    chunks: msg.chunks || [],
                                    timestamp: msg.timestamp.toISOString()
                                  }))
                                );
                                
                                updateChatMessage(
                                  currentSessionId,
                                  messageIndex,
                                  newVersions,
                                  newVersionsChunks,
                                  messagesPerVersionPlain
                                ).catch(err => {
                                  console.error('Error saving version information:', err);
                                });
                              }
                              
                              // Trigger session refresh
                              if (onMessageSent) {
                                onMessageSent();
                              }
                            },
                            (error) => {
                              console.error('Streaming error:', error);
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
                        }
                      }
                    }}
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) (svg as SVGElement).style.stroke = theme.colors.accent.primary;
                    }}
                    onMouseLeave={(e) => {
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) (svg as SVGElement).style.stroke = theme.colors.text.secondary;
                    }}
                    data-tooltip="Try again"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.text.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s ease' }}>
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                    </svg>
                  </button>
                  
                  {message.chunks && message.chunks.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedChunks(message.chunks || []);
                        setIsModalOpen(true);
                      }}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        const svg = e.currentTarget.querySelector('svg');
                        if (svg) (svg as SVGElement).style.stroke = theme.colors.accent.primary;
                      }}
                      onMouseLeave={(e) => {
                        const svg = e.currentTarget.querySelector('svg');
                        if (svg) (svg as SVGElement).style.stroke = theme.colors.layout.primary;
                      }}
                      data-tooltip="View Retrieved Passages"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.layout.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s ease' }}>
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isStreaming && (
          <div style={{ 
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'flex-start'
          }}>
            <div style={{ 
              padding: '12px',
              borderRadius: '8px',
              maxWidth: '80%'
            }}>
              {currentAnswer}
              <span style={{ animation: 'blink 1s infinite' }}>|</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Query Input Box - Fixed at bottom */}
      <form onSubmit={handleSubmit} style={{ 
        padding: '16px 0',
        borderTop: `1px solid ${theme.colors.text.quaternary}`,
        backgroundColor: theme.colors.white,
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <textarea
            ref={textareaRef}
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
              border: `1px solid ${theme.colors.text.quaternary}`,
              borderRadius: '8px',
              resize: 'vertical',
              fontFamily: 'inherit',
              backgroundColor: theme.colors.white,
              color: theme.colors.text.primary
            }}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!query.trim() || isStreaming}
            style={{
              padding: '12px 24px',
              backgroundColor: isStreaming ? theme.colors.text.tertiary : theme.colors.accent.primary,
              color: theme.colors.white,
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

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>

      {/* Retrieved Passages Modal */}
      <RetrievedPassagesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        chunks={selectedChunks}
      />
    </div>
  );
};

export default RAGChat;