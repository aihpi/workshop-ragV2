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

  const handleModelSelect = async (model: ModelInfo) => {
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
        await setActiveModel(model.id);
        setActiveModelState(model);
        setIsDropdownOpen(false);
        if (onModelChange) {
          onModelChange(model.id);
        }
      } catch (error) {
        console.error('Error setting active model:', error);
        alert('Failed to switch model');
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

  const handleDeleteModel = async () => {
    if (!activeModel || !activeModel.downloaded) return;
    
    if (!confirm(`Delete model "${activeModel.name}"? This will remove it from disk.`)) {
      return;
    }

    try {
      setIsLoading(true);
      const success = await deleteModel(activeModel.id);
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
                  backgroundColor: model.active ? theme.colors.accent.quaternary : theme.colors.white,
                }}
              >
                <button
                  onClick={() => handleModelSelect(model)}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    padding: 0,
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
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
                    {model.downloaded ? (
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
