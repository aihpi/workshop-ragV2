import React, { useState, useEffect } from 'react';
import { theme } from '../theme';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onSettingsClick: () => void;
  chatHistoryEnabled: boolean;
  onChatHistoryToggle: (enabled: boolean) => void;
  ragEnabled: boolean;
  onRagToggle: (enabled: boolean) => void;
  retrievalModeEnabled: boolean;
  onRetrievalModeToggle: (enabled: boolean) => void;
  graphRagEnabled: boolean;
  onGraphRagToggle: (enabled: boolean) => void;
  graphRagStrategy: 'none' | 'merge' | 'pre_filter' | 'post_enrich';
  onGraphRagStrategyChange: (strategy: 'none' | 'merge' | 'pre_filter' | 'post_enrich') => void;
  chatSessions: Array<{
    session_id: string;
    created_at: string;
    num_messages: number;
    first_query?: string;
  }>;
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  onNewChat,
  onSettingsClick,
  chatHistoryEnabled,
  onChatHistoryToggle,
  ragEnabled,
  onRagToggle,
  retrievalModeEnabled,
  onRetrievalModeToggle,
  graphRagEnabled,
  onGraphRagToggle,
  graphRagStrategy,
  onGraphRagStrategyChange,
  chatSessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [menuOpenSession, setMenuOpenSession] = useState<string | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (menuOpenSession) {
        setMenuOpenSession(null);
      }
    };
    
    if (menuOpenSession) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [menuOpenSession]);

  const filteredSessions = chatSessions.filter(session => {
    // For now, just filter by date (we could add session names later)
    const date = new Date(session.created_at).toLocaleDateString();
    return date.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const formatSessionDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isCollapsed) {
    return (
      <div style={{
        width: '60px',
        backgroundColor: theme.colors.white,
        borderRight: `1px solid ${theme.colors.text.quaternary}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'relative',
        fontFamily: theme.fonts.family,
      }}>
        <button
          onClick={onToggleCollapse}
          style={{
            padding: '16px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontSize: '20px',
            color: theme.colors.text.primary,
          }}
          title="Expand sidebar"
        >
          ☰
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: '280px',
      backgroundColor: theme.colors.white,
      borderRight: `1px solid ${theme.colors.text.quaternary}`,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'relative',
      fontFamily: theme.fonts.family,
    }}>
      {/* Header with collapse button */}
      <div style={{
        padding: '16px',
        borderBottom: `1px solid ${theme.colors.text.quaternary}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <img 
          src="/img/logo_aisc_bmftr.jpg" 
          alt="Logo" 
          style={{ 
            width: 'calc(100% - 40px)',
            height: 'auto',
            objectFit: 'contain',
          }} 
        />
        <button
          onClick={onToggleCollapse}
          style={{
            padding: '4px 8px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontSize: '18px',
            color: theme.colors.text.primary,
          }}
          title="Collapse sidebar"
        >
          ◀
        </button>
      </div>

      {/* Scrollable section */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
      }}>
        {/* Actions */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={onNewChat}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: theme.colors.accent.primary,
              color: theme.colors.white,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: theme.fonts.weight.bold,
              marginBottom: '12px',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.accent.secondary}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.accent.primary}
          >
            + New Chat
          </button>

          {/* Search Chats */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${theme.colors.text.quaternary}`,
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
              fontFamily: theme.fonts.family,
              color: theme.colors.text.primary,
            }}
          />
        </div>

        {/* Configuration Toggles */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ 
            margin: '0 0 12px 0', 
            fontSize: '13px', 
            fontWeight: 'bold', 
            color: '#666',
            textTransform: 'uppercase' 
          }}>
            Configuration
          </h4>

          {/* Chat History Toggle */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}>
            <label style={{ fontSize: '14px', color: theme.colors.text.primary }}>Chat History</label>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={chatHistoryEnabled}
                onChange={(e) => onChatHistoryToggle(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: chatHistoryEnabled ? theme.colors.layout.primary : theme.colors.text.tertiary,
                transition: '0.4s',
                borderRadius: '24px',
              }}>
                <span style={{
                  position: 'absolute',
                  content: '',
                  height: '18px',
                  width: '18px',
                  left: chatHistoryEnabled ? '23px' : '3px',
                  bottom: '3px',
                  backgroundColor: theme.colors.white,
                  transition: '0.4s',
                  borderRadius: '50%',
                }}></span>
              </span>
            </label>
          </div>

          {/* RAG Toggle */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}>
            <label style={{ fontSize: '14px', color: theme.colors.text.primary }}>RAG</label>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={ragEnabled}
                onChange={(e) => onRagToggle(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: ragEnabled ? theme.colors.layout.primary : theme.colors.text.tertiary,
                transition: '0.4s',
                borderRadius: '24px',
              }}>
                <span style={{
                  position: 'absolute',
                  content: '',
                  height: '18px',
                  width: '18px',
                  left: ragEnabled ? '23px' : '3px',
                  bottom: '3px',
                  backgroundColor: theme.colors.white,
                  transition: '0.4s',
                  borderRadius: '50%',
                }}></span>
              </span>
            </label>
          </div>

          {/* Retrieval Model Toggle */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}>
            <label style={{ fontSize: '14px', color: theme.colors.text.primary }}>Retrieval Mode</label>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={retrievalModeEnabled}
                onChange={(e) => onRetrievalModeToggle(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: retrievalModeEnabled ? theme.colors.layout.primary : theme.colors.text.tertiary,
                transition: '0.4s',
                borderRadius: '24px',
              }}>
                <span style={{
                  position: 'absolute',
                  content: '',
                  height: '18px',
                  width: '18px',
                  left: retrievalModeEnabled ? '23px' : '3px',
                  bottom: '3px',
                  backgroundColor: theme.colors.white,
                  transition: '0.4s',
                  borderRadius: '50%',
                }}></span>
              </span>
            </label>
          </div>

          {/* Graph RAG Toggle */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}>
            <label style={{ fontSize: '14px', color: theme.colors.text.primary }}>Graph RAG</label>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={graphRagEnabled}
                onChange={(e) => onGraphRagToggle(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: graphRagEnabled ? theme.colors.layout.primary : theme.colors.text.tertiary,
                transition: '0.4s',
                borderRadius: '24px',
              }}>
                <span style={{
                  position: 'absolute',
                  content: '',
                  height: '18px',
                  width: '18px',
                  left: graphRagEnabled ? '23px' : '3px',
                  bottom: '3px',
                  backgroundColor: theme.colors.white,
                  transition: '0.4s',
                  borderRadius: '50%',
                }}></span>
              </span>
            </label>
          </div>

          {/* Graph RAG Strategy Dropdown - only visible when Graph RAG is enabled */}
          {graphRagEnabled && (
            <div style={{
              marginBottom: '12px',
              paddingLeft: '8px',
              borderLeft: `2px solid ${theme.colors.layout.primary}`,
            }}>
              <label style={{ 
                fontSize: '12px', 
                color: theme.colors.text.secondary,
                display: 'block',
                marginBottom: '6px',
              }}>
                Strategy
              </label>
              <select
                value={graphRagStrategy}
                onChange={(e) => onGraphRagStrategyChange(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: `1px solid ${theme.colors.text.quaternary}`,
                  borderRadius: '4px',
                  fontSize: '13px',
                  backgroundColor: theme.colors.white,
                  color: theme.colors.text.primary,
                  cursor: 'pointer',
                }}
              >
                <option value="merge">Merge (Vector + Graph)</option>
                <option value="pre_filter">Pre-filter (Graph → Vector)</option>
                <option value="post_enrich">Post-enrich (Vector → Graph)</option>
              </select>
            </div>
          )}
        </div>

        {/* Chat History Section */}
        <div>
          <h4 style={{ 
            margin: '0 0 12px 0', 
            fontSize: '13px', 
            fontWeight: theme.fonts.weight.bold, 
            color: theme.colors.text.secondary,
            textTransform: 'uppercase' 
          }}>
            Chats
          </h4>

          {filteredSessions.length === 0 ? (
            <p style={{ 
              fontSize: '13px', 
              color: theme.colors.text.tertiary, 
              textAlign: 'center', 
              padding: '16px 0' 
            }}>
              No chats yet
            </p>
          ) : (
            <div>
              {filteredSessions.map(session => (
                <div
                  key={session.session_id}
                  style={{
                    padding: '8px 12px',
                    marginBottom: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background-color 0.2s ease',
                    position: 'relative',
                    backgroundColor: currentSessionId === session.session_id 
                      ? '#f6a800' 
                      : hoveredSession === session.session_id 
                        ? 'rgba(246, 168, 0, 0.3)' 
                        : 'transparent',
                  }}
                  onClick={() => onSelectSession(session.session_id)}
                  onMouseEnter={() => setHoveredSession(session.session_id)}
                  onMouseLeave={() => {
                    setHoveredSession(null);
                    if (menuOpenSession !== session.session_id) {
                      setMenuOpenSession(null);
                    }
                  }}
                >
                  <div style={{ 
                    flex: 1, 
                    minWidth: 0,
                    fontSize: '13px', 
                    color: theme.colors.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {session.first_query || `Chat ${formatSessionDate(session.created_at)}`}
                  </div>
                  
                  {/* Three dots menu - always takes up space */}
                  <div style={{ position: 'relative', width: '32px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenSession(menuOpenSession === session.session_id ? null : session.session_id);
                      }}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: theme.colors.text.secondary,
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        opacity: (hoveredSession === session.session_id || menuOpenSession === session.session_id) ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      ...
                    </button>
                    
                    {/* Dropdown menu */}
                    {menuOpenSession === session.session_id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          backgroundColor: theme.colors.white,
                          border: `1px solid ${theme.colors.text.quaternary}`,
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          zIndex: 1000,
                          minWidth: '120px',
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newName = prompt('Enter new name:', session.first_query || '');
                            if (newName) {
                              // TODO: Implement rename functionality
                              console.log('Rename to:', newName);
                            }
                            setMenuOpenSession(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: theme.colors.text.primary,
                            cursor: 'pointer',
                            fontSize: '13px',
                            textAlign: 'left',
                            transition: 'background-color 0.2s ease',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.highlight.quaternary}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          Rename
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this chat?')) {
                              onDeleteSession(session.session_id);
                            }
                            setMenuOpenSession(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: theme.colors.accent.primary,
                            cursor: 'pointer',
                            fontSize: '13px',
                            textAlign: 'left',
                            transition: 'background-color 0.2s ease',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.highlight.quaternary}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Section - Settings Button */}
      <div style={{
        padding: '16px',
        borderTop: `1px solid ${theme.colors.text.quaternary}`,
        backgroundColor: theme.colors.white,
      }}>
        <button
          onClick={onSettingsClick}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: theme.colors.text.secondary,
            color: theme.colors.white,
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: theme.fonts.weight.bold,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.text.primary}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.text.secondary}
        >
          ⚙️ Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
