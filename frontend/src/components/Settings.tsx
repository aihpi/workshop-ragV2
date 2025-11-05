import React, { useState, useEffect } from 'react';
import { 
  listDocuments, 
  deleteDocument, 
  syncDocuments, 
  Document,
  getAvailableModels,
  downloadModel,
  setActiveModel,
  deleteModel,
  getDownloadProgress,
  ModelInfo,
  DownloadProgress
} from '../services/api';

const Settings: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  
  // Model management state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [downloadingModels, setDownloadingModels] = useState<Record<string, number>>({});
  const [modelLoading, setModelLoading] = useState(false);

  // Model and System Information
  const [systemInfo] = useState({
    backendUrl: import.meta.env.VITE_API_URL || 'http://localhost:8005',
    embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
    llmModel: 'Qwen/Qwen2.5-0.5B-Instruct',
    vectorDatabase: 'Qdrant',
    vectorDimensions: 384,
    chunkSize: 512,
    chunkOverlap: 128
  });

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
      // Don't show alert for documents in Settings - it's optional
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    setModelLoading(true);
    try {
      const availableModels = await getAvailableModels();
      setModels(availableModels);
      
      // Initialize with default models if none from backend
      if (availableModels.length === 0) {
        const defaultModels: ModelInfo[] = [
          { id: 'qwen2.5:1.5b-instruct', name: 'Qwen2.5 1.5B Instruct', downloaded: false, active: false },
          { id: 'qwen2.5:3b-instruct', name: 'Qwen2.5 3B Instruct', downloaded: false, active: false },
          { id: 'qwen2.5:7b-instruct', name: 'Qwen2.5 7B Instruct', downloaded: false, active: false }
        ];
        setModels(defaultModels);
      }
    } catch (error) {
      console.error('Error loading models:', error);
      // Set default models on error
      const defaultModels: ModelInfo[] = [
        { id: 'qwen2.5:1.5b-instruct', name: 'Qwen2.5 1.5B Instruct', downloaded: false, active: false },
        { id: 'qwen2.5:3b-instruct', name: 'Qwen2.5 3B Instruct', downloaded: false, active: false },
        { id: 'qwen2.5:7b-instruct', name: 'Qwen2.5 7B Instruct', downloaded: false, active: false }
      ];
      setModels(defaultModels);
    } finally {
      setModelLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadModels();
  }, []);

  const handleDeleteDocument = async (documentId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDocument(documentId);
      setDocuments(prev => prev.filter(doc => doc.document_id !== documentId));
      alert('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Error deleting document. Please try again.');
    }
  };

  const handleSyncDocuments = async () => {
    setLoading(true);
    setUploadProgress('Syncing documents with vector database...');
    try {
      await syncDocuments();
      await loadDocuments();
      setUploadProgress('Sync completed successfully');
      setTimeout(() => setUploadProgress(''), 3000);
    } catch (error) {
      console.error('Error syncing documents:', error);
      setUploadProgress('Sync failed. Please try again.');
      setTimeout(() => setUploadProgress(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    try {
      setDownloadingModels(prev => ({ ...prev, [modelId]: 0 }));
      
      const success = await downloadModel(modelId);
      if (success) {
        // Poll backend for real progress updates
        const progressInterval = setInterval(async () => {
          try {
            const progressData = await getDownloadProgress(modelId);
            if (progressData) {
              const progress = progressData.progress;
              setDownloadingModels(prev => ({ ...prev, [modelId]: progress }));
              
              if (progressData.status === 'completed' || progress >= 100) {
                clearInterval(progressInterval);
                setDownloadingModels(prev => {
                  const newState = { ...prev };
                  delete newState[modelId];
                  return newState;
                });
                // Update model as downloaded and reload models
                await loadModels();
              } else if (progressData.status === 'error') {
                clearInterval(progressInterval);
                setDownloadingModels(prev => {
                  const newState = { ...prev };
                  delete newState[modelId];
                  return newState;
                });
                alert('Download failed. Please try again.');
              }
            }
          } catch (error) {
            // If we can't get progress, the download might be done
            clearInterval(progressInterval);
            setDownloadingModels(prev => {
              const newState = { ...prev };
              delete newState[modelId];
              return newState;
            });
            // Reload models to check if download completed
            await loadModels();
          }
        }, 2000); // Poll every 2 seconds
        
        // Set a timeout to stop polling after 10 minutes
        setTimeout(() => {
          clearInterval(progressInterval);
          setDownloadingModels(prev => {
            const newState = { ...prev };
            delete newState[modelId];
            return newState;
          });
        }, 600000); // 10 minutes
      } else {
        setDownloadingModels(prev => {
          const newState = { ...prev };
          delete newState[modelId];
          return newState;
        });
        alert('Failed to start download. Please try again.');
      }
    } catch (error) {
      console.error('Error downloading model:', error);
      setDownloadingModels(prev => {
        const newState = { ...prev };
        delete newState[modelId];
        return newState;
      });
      alert('Error downloading model. Please try again.');
    }
  };

  const handleSetActiveModel = async (modelId: string) => {
    try {
      const success = await setActiveModel(modelId);
      if (success) {
        setModels(prev => prev.map(model => ({
          ...model,
          active: model.id === modelId
        })));
        alert('Model set as active successfully!');
      } else {
        alert('Failed to set model as active. Please try again.');
      }
    } catch (error) {
      console.error('Error setting active model:', error);
      alert('Error setting active model. Please try again.');
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm('Are you sure you want to delete this model? This action cannot be undone.')) {
      return;
    }

    try {
      const success = await deleteModel(modelId);
      if (success) {
        setModels(prev => prev.map(model => 
          model.id === modelId 
            ? { ...model, downloaded: false, active: false }
            : model
        ));
        alert('Model deleted successfully!');
      } else {
        alert('Failed to delete model. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      alert('Error deleting model. Please try again.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalDocuments = documents.length;
  const totalSize = documents.reduce((sum, doc) => sum + doc.file_size, 0);
  const totalChunks = documents.reduce((sum, doc) => sum + doc.num_chunks, 0);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '16px' }}>
      {/* System Information */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0' }}>System Configuration</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px'
        }}>
          <div style={{
            padding: '16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: '#f9fafb'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Backend Connection</h4>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              <div><strong>URL:</strong> {systemInfo.backendUrl}</div>
              <div style={{ marginTop: '4px' }}>
                <span style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: '#10b981',
                  color: 'white'
                }}>
                  ✓ Connected
                </span>
              </div>
            </div>
          </div>

          <div style={{
            padding: '16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: '#f9fafb'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Models</h4>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Select Model:
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    fontSize: '14px'
                  }}
                  disabled={modelLoading}
                >
                  <option value="">Select a model...</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.active ? '(Active)' : ''} {model.downloaded ? '(Downloaded)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedModel && (
                <div style={{ marginTop: '16px' }}>
                  {(() => {
                    const model = models.find(m => m.id === selectedModel);
                    if (!model) return null;

                    if (downloadingModels[selectedModel] !== undefined) {
                      return (
                        <div>
                          <div style={{ marginBottom: '8px', color: '#059669' }}>
                            Downloading... {Math.round(downloadingModels[selectedModel])}%
                          </div>
                          <div style={{
                            width: '100%',
                            height: '8px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '4px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${downloadingModels[selectedModel]}%`,
                              height: '100%',
                              backgroundColor: '#10b981',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>
                      );
                    }

                    if (!model.downloaded) {
                      return (
                        <button
                          onClick={() => handleDownloadModel(model.id)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          Download
                        </button>
                      );
                    }

                    return (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {!model.active && (
                          <button
                            onClick={() => handleSetActiveModel(model.id)}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#059669',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            Set Active
                          </button>
                        )}
                        
                        {model.active && (
                          <span style={{
                            padding: '8px 16px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            borderRadius: '6px',
                            fontSize: '14px'
                          }}>
                            ✓ Active Model
                          </span>
                        )}
                        
                        <button
                          onClick={() => handleDeleteModel(model.id)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          <div style={{
            padding: '16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: '#f9fafb'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Vector Database</h4>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              <div><strong>Type:</strong> {systemInfo.vectorDatabase}</div>
              <div><strong>Dimensions:</strong> {systemInfo.vectorDimensions}</div>
            </div>
          </div>

          <div style={{
            padding: '16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: '#f9fafb'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Text Processing</h4>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              <div><strong>Chunk Size:</strong> {systemInfo.chunkSize} tokens</div>
              <div><strong>Overlap:</strong> {systemInfo.chunkOverlap} tokens</div>
            </div>
          </div>
        </div>
      </div>

      {/* Document Statistics */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Document Statistics</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px'
        }}>
          <div style={{
            padding: '16px',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            backgroundColor: '#eff6ff',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8' }}>
              {totalDocuments}
            </div>
            <div style={{ fontSize: '14px', color: '#3730a3' }}>Documents</div>
          </div>

          <div style={{
            padding: '16px',
            border: '1px solid #10b981',
            borderRadius: '8px',
            backgroundColor: '#f0fdf4',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
              {totalChunks}
            </div>
            <div style={{ fontSize: '14px', color: '#065f46' }}>Chunks</div>
          </div>

          <div style={{
            padding: '16px',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            backgroundColor: '#fffbeb',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>
              {formatFileSize(totalSize)}
            </div>
            <div style={{ fontSize: '14px', color: '#92400e' }}>Total Size</div>
          </div>
        </div>
      </div>

      {/* Document Management */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{ margin: 0 }}>Document Management</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={loadDocuments}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={handleSyncDocuments}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Syncing...' : 'Sync All'}
            </button>
          </div>
        </div>

        {uploadProgress && (
          <div style={{
            padding: '12px',
            marginBottom: '16px',
            backgroundColor: uploadProgress.includes('failed') ? '#fef2f2' : '#f0f9ff',
            border: `1px solid ${uploadProgress.includes('failed') ? '#fca5a5' : '#93c5fd'}`,
            borderRadius: '6px',
            color: uploadProgress.includes('failed') ? '#dc2626' : '#1d4ed8'
          }}>
            {uploadProgress}
          </div>
        )}

        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {documents.length === 0 ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              No documents uploaded yet. Go to the RAG Chat tab to upload documents.
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: '400px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      Filename
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      Type
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      Size
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      Chunks
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      Upload Date
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.document_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 'bold' }}>{doc.filename}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          ID: {doc.document_id}
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: '#6b7280' }}>
                        {doc.file_type.toUpperCase()}
                      </td>
                      <td style={{ padding: '12px', color: '#6b7280' }}>
                        {formatFileSize(doc.file_size)}
                      </td>
                      <td style={{ padding: '12px', color: '#6b7280' }}>
                        {doc.num_chunks}
                      </td>
                      <td style={{ padding: '12px', color: '#6b7280' }}>
                        {new Date(doc.upload_date).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => handleDeleteDocument(doc.document_id, doc.filename)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* API Endpoints */}
      <div>
        <h3 style={{ margin: '0 0 16px 0' }}>API Endpoints</h3>
        <div style={{
          padding: '16px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '14px'
        }}>
          <div style={{ marginBottom: '8px' }}>
            <strong>Documents:</strong> {systemInfo.backendUrl}/api/v1/documents/
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Query:</strong> {systemInfo.backendUrl}/api/v1/query/
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Chat:</strong> {systemInfo.backendUrl}/api/v1/chat/
          </div>
          <div>
            <strong>Health:</strong> {systemInfo.backendUrl}/health
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;