import React, { useState, useEffect, useRef } from 'react';
import { ModelInfo, getAvailableModels, setActiveModel, deleteModel, downloadModel } from '../services/api';
import { theme } from '../theme';

interface ModelSelectorProps {
  onModelChange?: (modelId: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange }) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeModel, setActiveModelState] = useState<ModelInfo | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [hfToken, setHfToken] = useState('');
  const [selectedModelForDownload, setSelectedModelForDownload] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadModels();
  }, []);

  // Auto-refresh models list when dropdown is open (to update download status)
  useEffect(() => {
    if (!isDropdownOpen) return;
    
    // Check if any model is downloading
    const hasDownloading = models.some(m => m.downloading);
    if (!hasDownloading) return;
    
    // Poll every 5 seconds while downloading
    const interval = setInterval(() => {
      loadModels();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isDropdownOpen, models]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setShowCustomInput(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadModels = async () => {
    setIsLoading(true);
    try {
      const availableModels = await getAvailableModels();
      setModels(availableModels);
      
      // Set active model
      const active = availableModels.find(m => m.active);
      if (active) {
        setActiveModelState(active);
      } else if (availableModels.length > 0) {
        setActiveModelState(availableModels[0]);
      }
    } catch (error) {
      console.error('Error loading models:', error);
      // Set default models on error
      const defaultModels: ModelInfo[] = [
        { id: 'qwen2.5:1.5b-instruct', name: 'Qwen2.5 1.5B Instruct', downloaded: false, active: true },
      ];
      setModels(defaultModels);
      setActiveModelState(defaultModels[0]);
    } finally {
      setIsLoading(false);
    }
  };

  const [switchingModel, setSwitchingModel] = useState<string | null>(null);

  // Poll vLLM status until ready
  const waitForVllm = async (maxWait: number = 120): Promise<boolean> => {
    const pollInterval = 3000; // 3 seconds
    let waited = 0;
    
    while (waited < maxWait * 1000) {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/models/vllm-status`);
        const data = await response.json();
        if (data.status === 'ready') {
          return true;
        }
      } catch (e) {
        // Ignore errors, keep polling
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }
    return false;
  };

  const handleModelSelect = async (model: ModelInfo) => {
    // Check if download is in progress
    if (model.downloading) {
      alert(`Model "${model.name}" is still downloading. Please wait for the download to complete.`);
      return;
    }
    
    if (!model.downloaded) {
      // Show confirmation dialog for download
      setSelectedModelForDownload(model.id);
      if (model.gated) {
        setShowTokenInput(true);
      } else {
        if (confirm(`Model "${model.name}" is not downloaded. Download now?`)) {
          await handleDownloadModel(model.id);
        }
      }
    } else {
      // Switch to downloaded model
      try {
        setIsLoading(true);
        setSwitchingModel(model.name);
        setIsDropdownOpen(false);
        
        const response = await setActiveModel(model.id);
        
        if (response.status === 'ready') {
          setActiveModelState(model);
          if (onModelChange) {
            onModelChange(model.id);
          }
        } else if (response.status === 'loading') {
          // Model is loading, poll for vLLM readiness
          const isReady = await waitForVllm(120);
          
          if (isReady) {
            setActiveModelState(model);
            if (onModelChange) {
              onModelChange(model.id);
            }
          } else {
            // Still not ready after timeout
            alert(`Model "${model.name}" is still loading. Please wait a moment and try your query.`);
            setActiveModelState(model);
            if (onModelChange) {
              onModelChange(model.id);
            }
          }
        } else {
          alert('Failed to switch model');
        }
      } catch (error: unknown) {
        console.error('Error setting active model:', error);
        // Extract error message from backend
        const errorMessage = error instanceof Error 
          ? error.message 
          : (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to switch model';
        alert(errorMessage);
      } finally {
        setIsLoading(false);
        setSwitchingModel(null);
      }
    }
  };

  const handleDownloadModel = async (modelId: string, token?: string) => {
    try {
      setIsLoading(true);
      const success = await downloadModel(modelId, token);
      if (success) {
        alert('Model download started. This may take a while...');
        // Reload models to update status
        await loadModels();
        setShowTokenInput(false);
        setSelectedModelForDownload(null);
      } else {
        alert('Failed to start model download');
      }
    } catch (error) {
      console.error('Error downloading model:', error);
      alert('Error downloading model');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomModel = () => {
    if (!customModelId.trim()) return;
    
    const customModel: ModelInfo = {
      id: customModelId,
      name: customModelId,
      downloaded: false,
      active: false,
      gated: false,
    };
    
    handleModelSelect(customModel);
    setCustomModelId('');
    setShowCustomInput(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }} ref={dropdownRef}>
      {/* Loading Overlay for Model Switching */}
      {switchingModel && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: theme.colors.white,
            padding: '24px 48px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            textAlign: 'center',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f0f0f0',
              borderTopColor: theme.colors.accent.primary,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }} />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
              }
            `}</style>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
              Switching Model
            </div>
            <div style={{ fontSize: '14px', color: theme.colors.text.secondary }}>
              Loading {switchingModel}...
            </div>
            <div style={{ fontSize: '12px', color: theme.colors.text.tertiary, marginTop: '8px' }}>
              This may take up to 60 seconds
            </div>
          </div>
        </div>
      )}

      {/* Active Model Display with Dropdown */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        disabled={isLoading}
        style={{
          padding: '8px 16px',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: '500',
          color: theme.colors.text.primary,
        }}
      >
        <span>{activeModel?.name || 'No Model Selected'}</span>
        <span style={{ fontSize: '10px' }}>▼</span>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          backgroundColor: theme.colors.white,
          border: '1px solid theme.colors.text.quaternary',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          minWidth: '250px',
          maxHeight: '400px',
          overflowY: 'auto',
          zIndex: 1000,
        }}>
          {/* Custom Model Input */}
          <div style={{
            padding: '12px',
            borderBottom: '1px solid theme.colors.text.quaternary',
          }}>
            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'theme.colors.highlight.quaternary',
                  border: '1px solid theme.colors.text.quaternary',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                }}
              >
                + Custom Model (HuggingFace ID)
              </button>
            ) : (
              <div>
                <input
                  type="text"
                  value={customModelId}
                  onChange={(e) => setCustomModelId(e.target.value)}
                  placeholder="e.g., meta-llama/Llama-2-7b"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid theme.colors.text.quaternary',
                    borderRadius: '4px',
                    fontSize: '13px',
                    marginBottom: '8px',
                    boxSizing: 'border-box',
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleCustomModel()}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleCustomModel}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: 'theme.colors.accent.primary',
                      color: theme.colors.white,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomModelId('');
                    }}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: '#6c757d',
                      color: theme.colors.white,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Token Input Dialog */}
          {showTokenInput && selectedModelForDownload && (
            <div style={{
              padding: '12px',
              borderBottom: '1px solid theme.colors.text.quaternary',
              backgroundColor: '#fff3cd',
            }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold' }}>
                This model requires authentication
              </p>
              <input
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder="HuggingFace Token"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid theme.colors.text.quaternary',
                  borderRadius: '4px',
                  fontSize: '13px',
                  marginBottom: '8px',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleDownloadModel(selectedModelForDownload, hfToken)}
                  disabled={!hfToken.trim()}
                  style={{
                    flex: 1,
                    padding: '6px',
                    backgroundColor: 'theme.colors.accent.primary',
                    color: theme.colors.white,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: hfToken.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                  }}
                >
                  Download
                </button>
                <button
                  onClick={() => {
                    setShowTokenInput(false);
                    setSelectedModelForDownload(null);
                    setHfToken('');
                  }}
                  style={{
                    flex: 1,
                    padding: '6px',
                    backgroundColor: '#6c757d',
                    color: theme.colors.white,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Predefined Models List */}
          <div>
            {models.map(model => (
              <div
                key={model.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  borderBottom: '1px solid #f0f0f0',
                  backgroundColor: model.active ? theme.colors.accent.quaternary : 
                                   model.downloading ? '#fff3cd' : theme.colors.white,
                  opacity: model.downloading ? 0.8 : 1,
                }}
              >
                <button
                  onClick={() => handleModelSelect(model)}
                  disabled={isLoading || model.downloading}
                  style={{
                    flex: 1,
                    padding: 0,
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: (isLoading || model.downloading) ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    fontSize: '13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: theme.colors.text.primary,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: model.active ? 'bold' : 'normal' }}>
                      {model.name}
                    </div>
                    {model.size && (
                      <div style={{ fontSize: '11px', color: theme.colors.text.secondary, marginTop: '2px' }}>
                        Size: {model.size}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {model.downloading ? (
                      <span style={{ 
                        fontSize: '11px', 
                        color: '#856404',
                        padding: '2px 6px',
                        backgroundColor: '#ffeeba',
                        borderRadius: '3px',
                        animation: 'pulse 1.5s infinite',
                      }}>
                        ⏳ Downloading...
                      </span>
                    ) : model.downloaded ? (
                      <span style={{ color: theme.colors.layout.primary, fontSize: '16px' }}>✓</span>
                    ) : (
                      <span style={{ 
                        fontSize: '11px', 
                        color: theme.colors.text.secondary,
                        padding: '2px 6px',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '3px',
                      }}>
                        Download
                      </span>
                    )}
                    {model.gated && (
                      <span style={{ fontSize: '14px' }} title="Requires authentication">
                        🔒
                      </span>
                    )}
                  </div>
                </button>
                
                {/* Delete button for each downloaded model */}
                {model.downloaded && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Delete model "${model.name}"? This will remove it from disk.`)) {
                        return;
                      }
                      try {
                        setIsLoading(true);
                        const success = await deleteModel(model.id);
                        if (success) {
                          alert('Model deleted successfully');
                          await loadModels();
                        } else {
                          alert('Failed to delete model');
                        }
                      } catch (error) {
                        console.error('Error deleting model:', error);
                        alert('Error deleting model');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    disabled={isLoading}
                    style={{
                      padding: '4px',
                      marginLeft: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      color: theme.colors.accent.primary,
                      fontSize: '16px',
                    }}
                    title="Delete this model"
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
