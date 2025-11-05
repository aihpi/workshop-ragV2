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
    <div>
      <h2>Document Management</h2>
      
      {message && (
        <div className={message.type}>{message.text}</div>
      )}

      <div className="card">
        <h3>Upload Document</h3>
        <div className="file-input-wrapper">
          <input
            type="file"
            id="file-upload"
            onChange={handleFileSelect}
            accept=".pdf,.txt,.docx,.doc,.html,.htm,.xml,.md"
          />
          <label htmlFor="file-upload" className="file-input-label">
            {selectedFile ? selectedFile.name : 'Choose a file...'}
          </label>
        </div>
        <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Supported formats: PDF, DOCX, TXT, MD, HTML, XML
        </p>
        <button onClick={handleUpload} disabled={!selectedFile || loading} style={{ marginTop: '1rem' }}>
          Upload
        </button>
        <button onClick={handleSync} disabled={loading} className="secondary" style={{ marginLeft: '1rem' }}>
          Sync from Data Folder
        </button>
      </div>

      <div className="card">
        <h3>Documents ({documents.length})</h3>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : documents.length === 0 ? (
          <p style={{ color: '#888' }}>No documents uploaded yet</p>
        ) : (
          <ul className="document-list">
            {documents.map((doc) => (
              <li key={doc.document_id} className="document-item">
                <div className="document-info">
                  <h3>{doc.filename}</h3>
                  <p>
                    {doc.file_type} • {(doc.file_size / 1024).toFixed(2)} KB • {doc.num_chunks} chunks •{' '}
                    {new Date(doc.upload_date).toLocaleString()}
                  </p>
                </div>
                <button onClick={() => handleDelete(doc.document_id)} className="danger">
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
