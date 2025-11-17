import { theme } from '../theme';
import React, { useRef, useEffect, useState } from 'react';
import { updateChatMessage } from '../services/api';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // For tracking multiple response versions
  versions?: string[]; // Array of response versions
  currentVersionIndex?: number; // Current version being displayed
  messagesPerVersion?: Message[][]; // Complete message list after each version
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
  currentSessionId: string | null;
  onMessageSent?: () => void;
}

const LLMChat: React.FC<LLMChatProps> = ({ chatState, setChatState, currentSessionId, onMessageSent }) => {
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
      query: ''
    });

    const assistantMessageId = (Date.now() + 1).toString();

    let finalAnswer = '';
    
    // Direct LLM API call (bypassing RAG)
    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_URL || ''}/api/v1/query/llm/stream?${new URLSearchParams({
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
          
          // Refocus the textarea
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 0);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Chat History Box */}
      <div style={{ 
        flex: 1,
        border: '1px solid theme.colors.text.quaternary', 
        borderRadius: '8px', 
        padding: '16px', 
        overflowY: 'auto',
        marginBottom: '16px',
        backgroundColor: 'theme.colors.highlight.quaternary'
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
              
              {/* Action buttons for LLM messages */}
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
                            const messageIndex = messages.findIndex(m => m.id === message.id);
                            
                            if (messageIndex === -1) {
                              console.error('Message not found in array');
                              return;
                            }
                            
                            // When going back from version N to N-1, restore messages that were deleted by version N
                            const deletedByCurrentVersion = message.deletedMessagesPerVersion?.[currentIdx] || [];
                            
                            const updatedMessage = { 
                              ...message, 
                              content: message.versions![newIdx], 
                              currentVersionIndex: newIdx 
                            };
                            
                            // Update messages: replace current message and add back deleted messages
                            const newMessages = [
                              ...messages.slice(0, messageIndex),
                              updatedMessage,
                              ...deletedByCurrentVersion
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
                            
                            // When going forward to version N, restore the messages that were deleted by that version
                            const deletedByNewVersion = message.deletedMessagesPerVersion?.[newIdx] || [];
                            
                            const updatedMessage = { 
                              ...message, 
                              content: message.versions![newIdx], 
                              currentVersionIndex: newIdx 
                            };
                            
                            // Remove the current message and add updated message + deleted messages from new version
                            const newMessages = [
                              ...messages.slice(0, messageIndex),
                              updatedMessage,
                              ...deletedByNewVersion
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
                      // Find the user message before this LLM message
                      const messageIndex = messages.findIndex(m => m.id === message.id);
                      if (messageIndex > 0) {
                        const previousUserMessage = messages[messageIndex - 1];
                        if (previousUserMessage.type === 'user') {
                          // Save messages that will be deleted
                          const deletedMessages = messages.slice(messageIndex + 1);
                          
                          // Delete all messages after and including this assistant message
                          const newMessages = messages.slice(0, messageIndex);
                          const userQuery = previousUserMessage.content;
                          
                          // Save current response as a version
                          const versions = message.versions || [message.content];
                          const deletedMessagesPerVersion = message.deletedMessagesPerVersion || [[]];
                          
                          setChatState({
                            ...chatState,
                            messages: newMessages,
                            isStreaming: true,
                            currentAnswer: '',
                            query: ''
                          });

                          const assistantMessageId = (Date.now() + 1).toString();
                          let finalAnswer = '';
                          
                          const eventSource = new EventSource(
                            `/api/v1/query/llm/stream?${new URLSearchParams({
                              query: userQuery,
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
                                // Add new response version
                                const newVersions = [...versions, finalAnswer];
                                const newDeletedMessagesPerVersion = [...deletedMessagesPerVersion, deletedMessages];
                                const finalMessage: Message = {
                                  id: assistantMessageId,
                                  type: 'assistant',
                                  content: finalAnswer,
                                  timestamp: new Date(),
                                  versions: newVersions,
                                  currentVersionIndex: newVersions.length - 1,
                                  deletedMessagesPerVersion: newDeletedMessagesPerVersion
                                };
                                
                                setChatState(prev => ({
                                  ...prev,
                                  messages: [...prev.messages, finalMessage],
                                  currentAnswer: '',
                                  isStreaming: false
                                }));
                                
                                // Save version information to backend if session exists
                                if (currentSessionId) {
                                  // Calculate message index
                                  const messageIndex = Math.floor(newMessages.length / 2);
                                  
                                  // Convert deleted messages to plain objects
                                  const deletedMessagesPlain = newDeletedMessagesPerVersion.map(versionDeleted => 
                                    versionDeleted.map(msg => ({
                                      query: msg.type === 'user' ? msg.content : undefined,
                                      answer: msg.type === 'assistant' ? msg.content : undefined,
                                      chunks: [],
                                      timestamp: msg.timestamp.toISOString()
                                    }))
                                  );
                                  
                                  updateChatMessage(
                                    currentSessionId,
                                    messageIndex,
                                    newVersions,
                                    undefined, // No chunks in LLM chat
                                    deletedMessagesPlain
                                  ).catch(err => {
                                    console.error('Error saving version information:', err);
                                  });
                                }
                                
                                // Trigger session refresh
                                if (onMessageSent) {
                                  onMessageSent();
                                }
                                
                                eventSource.close();
                                
                                // Auto-focus the input after streaming completes
                                setTimeout(() => textareaRef.current?.focus(), 0);
                              } else if (data.type === 'error') {
                                console.error('LLM streaming error:', data.error);
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

                          eventSource.onerror = (error) => {
                            console.error('EventSource error:', error);
                            const errorMessage: Message = {
                              id: assistantMessageId,
                              type: 'assistant',
                              content: '[Error] Failed to connect to LLM service',
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
              backgroundColor: 'transparent',
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
            placeholder="Ask the LLM anything... (Enter to send, Ctrl+Enter for new line)"
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
    </div>
  );
};

export default LLMChat;