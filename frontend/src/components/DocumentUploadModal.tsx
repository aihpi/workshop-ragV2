import { theme } from '../theme';
import React, { useState, useEffect } from 'react';
import { uploadDocument, listDocuments, deleteDocument, syncDocuments, Document } from '../services/api';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentsChange: () => void;
}

const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({ isOpen, onClose, onDocumentsChange }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load documents' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      setSelectedFile(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a file' });
      return;
    }

    try {
      setLoading(true);
      const result = await uploadDocument(selectedFile);
      setMessage({ type: 'success', text: result.message });
      setSelectedFile(null);
      await loadDocuments();
      onDocumentsChange();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to upload document' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      setLoading(true);
      await deleteDocument(documentId);
      setMessage({ type: 'success', text: 'Document deleted successfully' });
      await loadDocuments();
      onDocumentsChange();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete document' });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setLoading(true);
      const result = await syncDocuments();
      setMessage({
        type: 'success',
        text: `Synced ${result.total_synced} documents, skipped ${result.total_skipped}`,
      });
      await loadDocuments();
      onDocumentsChange();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync documents' });
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'theme.colors.white',
          borderRadius: '12px',
          padding: '24px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '80vh',
          overflow: 'auto',
          zIndex: 1001,
          color: 'theme.colors.text.primary',
          border: '1px solid theme.colors.text.quaternary',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h2 style={{ margin: 0, color: 'theme.colors.text.primary' }}>Document Management</h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: 'theme.colors.text.secondary666',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* Message */}
        {message && (
          <div style={{
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
            backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
            color: message.type === 'success' ? '#155724' : '#721c24',
            border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
          }}>
            {message.text}
          </div>
        )}

        {/* Upload Section */}
        <div style={{
          border: '1px solid theme.colors.text.quaternary',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
          backgroundColor: 'theme.colors.highlight.quaternary'
        }}>
          <h3 style={{ margin: '0 0 16px 0', color: 'theme.colors.text.primary' }}>Upload Document</h3>
          
          {/* Drag & Drop Area */}
          <div
            style={{
              border: `2px dashed ${dragOver ? 'theme.colors.accent.primary' : '#adb5bd'}`,
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              backgroundColor: dragOver ? '#e3f2fd' : 'theme.colors.white',
              transition: 'all 0.2s ease',
              marginBottom: '16px'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>+</div>
            <p style={{ margin: '0 0 8px 0', color: 'theme.colors.text.primary' }}>
              {selectedFile ? selectedFile.name : 'Drag & drop a file here, or click to select'}
            </p>
            <p style={{ margin: 0, color: 'theme.colors.text.secondary666', fontSize: '14px' }}>
              Supported: PDF, DOCX, TXT, MD, HTML, XML
            </p>
            <input
              type="file"
              onChange={handleFileSelect}
              accept=".pdf,.txt,.docx,.doc,.html,.htm,.xml,.md"
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              style={{
                display: 'inline-block',
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'theme.colors.white',
                borderRadius: '6px',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              Choose File
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || loading}
              style={{
                padding: '12px 24px',
                backgroundColor: selectedFile && !loading ? 'theme.colors.accent.primary' : '#6c757d',
                color: theme.colors.white,
                border: 'none',
                borderRadius: '6px',
                cursor: selectedFile && !loading ? 'pointer' : 'not-allowed',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={handleSync}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: loading ? '#6c757d' : '#28a745',
                color: theme.colors.white,
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Syncing...' : 'Sync from Data Folder'}
            </button>
          </div>
        </div>

        {/* Documents List */}
        <div style={{
          border: '1px solid theme.colors.text.quaternary',
          borderRadius: '8px',
          backgroundColor: 'theme.colors.highlight.quaternary'
        }}>
          <div style={{ 
            padding: '16px',
            borderBottom: '1px solid theme.colors.text.quaternary',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, color: 'theme.colors.text.primary' }}>
              Documents ({documents.length})
            </h3>
            <button
              onClick={loadDocuments}
              disabled={loading}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6c757d',
                color: theme.colors.white,
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div style={{ maxHeight: '300px', overflow: 'auto' }}>
            {documents.length === 0 ? (
              <div style={{ 
                padding: '32px', 
                textAlign: 'center', 
                color: 'theme.colors.text.secondary666' 
              }}>
                No documents uploaded yet
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.document_id}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid theme.colors.text.quaternary',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 4px 0', color: 'theme.colors.text.primary' }}>
                      {doc.filename}
                    </h4>
                    <p style={{ 
                      margin: 0, 
                      color: 'theme.colors.text.secondary666', 
                      fontSize: '14px' 
                    }}>
                      {doc.file_type.toUpperCase()} • {formatFileSize(doc.file_size)} • {doc.num_chunks} chunks • {new Date(doc.upload_date).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.document_id)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'theme.colors.accent.primary',
                      color: theme.colors.white,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DocumentUploadModal;