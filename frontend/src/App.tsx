import React, { useState } from 'react';
import DocumentManagement from './components/DocumentManagement';
import QueryInterface from './components/QueryInterface';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('upload');

  const tabs = [
    { id: 'upload', label: 'Upload Documents' },
    { id: 'query', label: 'Query Documents' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="container">
      <div className="header">
        <h1>RAG Tool</h1>
        <p>Retrieval-Augmented Generation System</p>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'upload' && <DocumentManagement />}
        {activeTab === 'query' && <QueryInterface />}
        {activeTab === 'settings' && (
          <div className="card">
            <h2>Settings</h2>
            <p style={{ color: '#888' }}>Settings panel coming soon...</p>
            <div className="form-group">
              <label>API Base URL</label>
              <input type="text" defaultValue="http://localhost:8000" />
            </div>
            <div className="form-group">
              <label>Default Temperature</label>
              <input type="number" defaultValue="0.7" step="0.1" min="0" max="2" />
            </div>
            <button>Save Settings</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
