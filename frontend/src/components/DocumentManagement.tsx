import { theme } from '../theme';
import React, { useState, useEffect } from 'react';
import { uploadDocument, listDocuments, deleteDocument, syncDocuments, Document } from '../services/api';

const DocumentManagement: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

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
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync documents' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ color: theme.colors.text.primary }}>Document Management</h2>
      
      {message && (
        <div style={{
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px',
          backgroundColor: message.type === 'success' ? theme.colors.layout.quaternary : theme.colors.accent.quaternary,
          color: message.type === 'success' ? theme.colors.layout.primary : theme.colors.accent.primary,
          border: `1px solid ${message.type === 'success' ? theme.colors.layout.primary : theme.colors.accent.primary}`,
        }}>
          {message.text}
        </div>
      )}

      <div style={{
        padding: '24px',
        borderRadius: '8px',
        marginBottom: '24px',
        border: `1px solid ${theme.colors.text.quaternary}`,
      }}>
        <h3 style={{ color: theme.colors.text.primary, marginBottom: '16px' }}>Upload Document</h3>
        <div>
          <input
            type="file"
            id="file-upload"
            onChange={handleFileSelect}
            accept=".pdf,.txt,.docx,.doc,.html,.htm,.xml,.md"
            style={{ display: 'none' }}
          />
          <label 
            htmlFor="file-upload" 
            style={{
              display: 'block',
              padding: '16px',
              backgroundColor: theme.colors.white,
              border: `2px dashed ${theme.colors.layout.primary}`,
              borderRadius: '8px',
              textAlign: 'center',
              cursor: 'pointer',
              color: theme.colors.text.primary,
              transition: 'all 0.2s',
            }}
          >
            {selectedFile ? selectedFile.name : '📁 Choose a file...'}
          </label>
        </div>
        <p style={{ color: theme.colors.text.secondary, fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Supported formats: PDF, DOCX, TXT, MD, HTML, XML
        </p>
        <button 
          onClick={handleUpload} 
          disabled={!selectedFile || loading} 
          style={{ 
            marginTop: '1rem',
            padding: '10px 20px',
            backgroundColor: !selectedFile || loading ? theme.colors.text.tertiary : theme.colors.accent.primary,
            color: theme.colors.white,
            border: 'none',
            borderRadius: '6px',
            cursor: !selectedFile || loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          Upload
        </button>
        <button 
          onClick={handleSync} 
          disabled={loading} 
          style={{ 
            marginLeft: '1rem',
            padding: '10px 20px',
            backgroundColor: loading ? theme.colors.text.tertiary : theme.colors.text.secondary,
            color: theme.colors.white,
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          Sync from Data Folder
        </button>
      </div>

      <div style={{
        padding: '24px',
        borderRadius: '8px',
        border: `1px solid ${theme.colors.text.quaternary}`,
      }}>
        <h3 style={{ color: theme.colors.text.primary, marginBottom: '16px' }}>Documents ({documents.length})</h3>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px', color: theme.colors.text.secondary }}>Loading...</div>
        ) : documents.length === 0 ? (
          <p style={{ color: theme.colors.text.secondary }}>No documents uploaded yet</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {documents.map((doc) => (
              <li 
                key={doc.document_id} 
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  backgroundColor: theme.colors.white,
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: `1px solid ${theme.colors.text.quaternary}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 8px 0', color: theme.colors.text.primary }}>{doc.filename}</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: theme.colors.text.secondary }}>
                    {doc.file_type} • {(doc.file_size / 1024).toFixed(2)} KB • {doc.num_chunks} chunks •{' '}
                    {new Date(doc.upload_date).toLocaleString()}
                  </p>
                </div>
                <button 
                  onClick={() => handleDelete(doc.document_id)} 
                  style={{
                    padding: '8px 16px',
                    backgroundColor: theme.colors.accent.primary,
                    color: theme.colors.white,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.accent.secondary}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.accent.primary}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DocumentManagement;
