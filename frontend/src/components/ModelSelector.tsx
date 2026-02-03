import React, { useState, useEffect, useRef } from 'react';
import { ModelInfo, getAvailableModels, setActiveModel, getOllamaStatus, pullModel, deleteModel } from '../services/api';
import { theme } from '../theme';

// Curated list of Qwen models
const POPULAR_MODELS = [
  // Small models (1-3B)
  { id: 'qwen2.5:1.5b-instruct', name: 'Qwen 2.5 1.5B Instruct', size: '~1GB', category: 'Small' },
  { id: 'qwen3:1.7b', name: 'Qwen 3 1.7B', size: '~1GB', category: 'Small' },
  // Medium models (3-8B)
  { id: 'qwen2.5:3b-instruct', name: 'Qwen 2.5 3B Instruct', size: '~2GB', category: 'Medium' },
  { id: 'qwen2.5:7b-instruct', name: 'Qwen 2.5 7B Instruct', size: '~4.5GB', category: 'Medium' },
  { id: 'qwen3:8b', name: 'Qwen 3 8B', size: '~5GB', category: 'Medium' },
  // Large models (8B+)
  { id: 'qwen2.5:14b-instruct', name: 'Qwen 2.5 14B Instruct', size: '~9GB', category: 'Large' },
  { id: 'qwen3:14b', name: 'Qwen 3 14B', size: '~9GB', category: 'Large' },
  { id: 'qwen2.5:32b-instruct', name: 'Qwen 2.5 32B Instruct', size: '~20GB', category: 'Large' },
];

interface ModelSelectorProps {
  onModelChange?: (modelId: string) => void;
}

interface DownloadProgress {
  modelId: string;
  status: string;
  completed: number;
  total: number;
  percent: number;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange }) => {
  const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
  const [activeModel, setActiveModelState] = useState<ModelInfo | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [showAvailable, setShowAvailable] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const status = await getOllamaStatus();
      setIsConnected(status.connected);
      
      if (!status.connected) {
        setError(status.error || 'Cannot connect to Ollama');
        setDownloadedModels([]);
        return;
      }
      
      const availableModels = await getAvailableModels();
      setDownloadedModels(availableModels);
      
      const active = availableModels.find(m => m.active);
      if (active) {
        setActiveModelState(active);
      } else if (availableModels.length > 0) {
        setActiveModelState(availableModels[0]);
      }
    } catch (error) {
      console.error('Error loading models:', error);
      setError('Failed to load models');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelSelect = async (model: ModelInfo) => {
    if (model.id === activeModel?.id) {
      setIsDropdownOpen(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await setActiveModel(model.id);
      
      if (response.status === 'success') {
        setActiveModelState(model);
        if (onModelChange) {
          onModelChange(model.id);
        }
      } else {
        setError(response.message || 'Failed to switch model');
      }
    } catch (error) {
      console.error('Error switching model:', error);
      setError('Failed to switch model');
    } finally {
      setIsLoading(false);
      setIsDropdownOpen(false);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    setDownloadProgress({ modelId, status: 'Starting...', completed: 0, total: 0, percent: 0 });
    
    const result = await pullModel(modelId, (progress) => {
      if (progress.completed && progress.total) {
        const percent = Math.round((progress.completed / progress.total) * 100);
        setDownloadProgress({
          modelId,
          status: progress.status,
          completed: progress.completed,
          total: progress.total,
          percent,
        });
      } else {
        setDownloadProgress(prev => prev ? {
          ...prev,
          status: progress.status,
        } : null);
      }
    });
    
    setDownloadProgress(null);
    
    if (result.success) {
      await loadModels();
    } else {
      setError(result.error || 'Failed to download model');
    }
  };

  const handleDeleteModel = async (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete model ${modelId}?`)) return;
    
    const result = await deleteModel(modelId);
    if (result.success) {
      await loadModels();
    } else {
      setError(result.error || 'Failed to delete model');
    }
  };

  const getDisplayName = () => {
    if (!isConnected) return '🔴 Ollama Offline';
    if (isLoading) return 'Loading...';
    if (activeModel) return `🦙 ${activeModel.name}`;
    if (downloadedModels.length === 0) return 'No models available';
    return 'Select Model';
  };

  // Get available models (from curated list) that are not downloaded
  const availableToDownload = POPULAR_MODELS.filter(pm => 
    !downloadedModels.some(dm => dm.id === pm.id)
  );

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '200px' }}>
      {/* Dropdown Button */}
      <button
        onClick={() => {
          if (!isDropdownOpen) loadModels();
          setIsDropdownOpen(!isDropdownOpen);
        }}
        disabled={isLoading || downloadProgress !== null}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: isConnected ? theme.colors.white : '#fee2e2',
          border: `1px solid ${isConnected ? theme.colors.text.quaternary : '#ef4444'}`,
          borderRadius: '6px',
          cursor: isLoading ? 'wait' : 'pointer',
          fontSize: '14px',
          minWidth: '200px',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{ 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          color: isConnected ? theme.colors.text.primary : '#dc2626'
        }}>
          {getDisplayName()}
        </span>
        <span style={{ 
          transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          color: theme.colors.text.secondary
        }}>
          ▼
        </span>
      </button>

      {/* Download Progress Indicator */}
      {downloadProgress && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          padding: '12px',
          backgroundColor: theme.colors.white,
          border: `1px solid ${theme.colors.text.quaternary}`,
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1001,
        }}>
          <div style={{ marginBottom: '8px', fontSize: '13px', color: theme.colors.text.primary }}>
            Downloading {downloadProgress.modelId}...
          </div>
          <div style={{ marginBottom: '4px', fontSize: '12px', color: theme.colors.text.secondary }}>
            {downloadProgress.status}
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: theme.colors.text.quaternary,
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${downloadProgress.percent}%`,
              height: '100%',
              backgroundColor: theme.colors.layout.primary,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: theme.colors.text.tertiary, textAlign: 'right' }}>
            {downloadProgress.percent}%
          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {isDropdownOpen && !downloadProgress && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          backgroundColor: theme.colors.white,
          border: `1px solid ${theme.colors.text.quaternary}`,
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          maxHeight: '500px',
          overflowY: 'auto',
          minWidth: '300px',
        }}>
          {/* Error message */}
          {error && (
            <div style={{
              padding: '12px',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              fontSize: '13px',
              borderBottom: `1px solid ${theme.colors.text.quaternary}`,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Tab switcher */}
          <div style={{
            display: 'flex',
            borderBottom: `1px solid ${theme.colors.text.quaternary}`,
          }}>
            <button
              onClick={() => setShowAvailable(false)}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                backgroundColor: !showAvailable ? theme.colors.accent.quaternary : 'transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: !showAvailable ? 'bold' : 'normal',
              }}
            >
              ✓ Downloaded ({downloadedModels.length})
            </button>
            <button
              onClick={() => setShowAvailable(true)}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                backgroundColor: showAvailable ? theme.colors.accent.quaternary : 'transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: showAvailable ? 'bold' : 'normal',
              }}
            >
              ↓ Available ({availableToDownload.length})
            </button>
          </div>

          {/* Downloaded Models Tab */}
          {!showAvailable && (
            <>
              {!isConnected ? (
                <div style={{ padding: '16px', textAlign: 'center', color: theme.colors.text.secondary }}>
                  <p style={{ margin: '0 0 8px 0' }}>Ollama is not running</p>
                  <p style={{ margin: 0, fontSize: '12px' }}>
                    Start Ollama with: <code>ollama serve</code>
                  </p>
                </div>
              ) : downloadedModels.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: theme.colors.text.secondary }}>
                  <p style={{ margin: '0 0 8px 0' }}>No models installed</p>
                  <p style={{ margin: 0, fontSize: '12px' }}>
                    Switch to "Available" tab to download models
                  </p>
                </div>
              ) : (
                downloadedModels.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => handleModelSelect(model)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      backgroundColor: model.active ? theme.colors.accent.quaternary : 'transparent',
                      borderBottom: `1px solid ${theme.colors.text.quaternary}`,
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!model.active) e.currentTarget.style.backgroundColor = theme.colors.highlight.quaternary;
                    }}
                    onMouseLeave={(e) => {
                      if (!model.active) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: model.active ? 'bold' : 'normal',
                        color: theme.colors.text.primary,
                        marginBottom: '2px',
                      }}>
                        {model.name}
                        {model.active && <span style={{ marginLeft: '8px', color: theme.colors.accent.primary }}>✓</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.colors.text.tertiary }}>
                        {model.size}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteModel(model.id, e)}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        color: theme.colors.text.tertiary,
                        fontSize: '14px',
                      }}
                      title="Delete model"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {/* Available Models Tab */}
          {showAvailable && (
            <>
              {availableToDownload.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: theme.colors.text.secondary }}>
                  All curated models are installed!
                </div>
              ) : (
                ['Small', 'Medium', 'Large'].map(category => {
                  const categoryModels = availableToDownload.filter(m => m.category === category);
                  if (categoryModels.length === 0) return null;
                  
                  return (
                    <div key={category}>
                      <div style={{
                        padding: '8px 16px',
                        backgroundColor: theme.colors.highlight.quaternary,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: theme.colors.text.secondary,
                        borderBottom: `1px solid ${theme.colors.text.quaternary}`,
                      }}>
                        {category} Models
                      </div>
                      {categoryModels.map(model => (
                        <div
                          key={model.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            borderBottom: `1px solid ${theme.colors.text.quaternary}`,
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ color: theme.colors.text.primary, marginBottom: '2px' }}>
                              {model.name}
                            </div>
                            <div style={{ fontSize: '12px', color: theme.colors.text.tertiary }}>
                              {model.size}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadModel(model.id)}
                            style={{
                              padding: '6px 12px',
                              border: `1px solid ${theme.colors.layout.primary}`,
                              backgroundColor: 'transparent',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: theme.colors.layout.primary,
                              fontSize: '12px',
                              fontWeight: 'bold',
                            }}
                          >
                            ↓ Download
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Refresh button */}
          <div style={{
            padding: '8px 16px',
            borderTop: `1px solid ${theme.colors.text.quaternary}`,
            backgroundColor: theme.colors.highlight.quaternary,
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadModels();
              }}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: theme.colors.white,
                border: `1px solid ${theme.colors.text.quaternary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              🔄 Refresh Models
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
