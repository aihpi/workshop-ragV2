import React, { useState } from 'react';
import { searchDocuments, RetrievedChunk } from '../services/api';

const RetrievedPassages: React.FC = () => {
  const [query, setQuery] = useState('');
  const [chunks, setChunks] = useState<RetrievedChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [topK, setTopK] = useState(10);
  const [scoreThreshold, setScoreThreshold] = useState(0.0);
  const [showMetadata, setShowMetadata] = useState(true);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const results = await searchDocuments(query, topK, scoreThreshold);
      setChunks(results);
    } catch (error) {
      console.error('Search error:', error);
      alert('Error searching documents. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return '#059669'; // green
    if (score >= 0.6) return '#d97706'; // orange
    if (score >= 0.4) return '#dc2626'; // red
    return '#6b7280'; // gray
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Poor';
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search Interface */}
      <div style={{ 
        padding: '16px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        marginBottom: '16px',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Search Query:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your search query..."
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #dee2e6',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#ffffff',
                color: '#333333'
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || isLoading}
              style={{
                padding: '12px 24px',
                backgroundColor: isLoading ? '#ccc' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Search Parameters */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          alignItems: 'center'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
              Top K Results: {topK}
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
              Score Threshold: {scoreThreshold.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={showMetadata}
                onChange={(e) => setShowMetadata(e.target.checked)}
              />
              Show Metadata
            </label>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {chunks.length === 0 && !isLoading && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '200px',
            color: '#6b7280',
            fontSize: '16px'
          }}>
            Enter a search query to retrieve relevant passages
          </div>
        )}

        {chunks.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 16px 0' }}>
              Retrieved Passages ({chunks.length} results)
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {chunks.map((chunk, index) => (
                <div
                  key={chunk.document_id + '-' + chunk.chunk_index}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: 'white'
                  }}
                >
                  {/* Header */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #eee'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontWeight: 'bold',
                        color: '#374151'
                      }}>
                        Passage #{index + 1}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: 'white',
                        backgroundColor: getScoreColor(chunk.score)
                      }}>
                        {getScoreLabel(chunk.score)} ({chunk.score.toFixed(3)})
                      </span>
                    </div>
                    
                    {showMetadata && chunk.filename && (
                      <span style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        fontFamily: 'monospace'
                      }}>
                        📄 {chunk.filename}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div style={{
                    lineHeight: '1.6',
                    color: '#374151',
                    marginBottom: showMetadata ? '12px' : '0'
                  }}>
                    {chunk.content}
                  </div>

                  {/* Metadata */}
                  {showMetadata && (
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}>
                      <strong>Metadata:</strong>
                      <div style={{ 
                        marginTop: '8px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '8px'
                      }}>
                        <div>
                          <span style={{ fontWeight: 'bold', color: '#374151' }}>
                            Document ID:
                          </span>{' '}
                          <span style={{ color: '#6b7280' }}>
                            {chunk.document_id}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 'bold', color: '#374171' }}>
                            Chunk Index:
                          </span>{' '}
                          <span style={{ color: '#6b7280' }}>
                            {chunk.chunk_index}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 'bold', color: '#374151' }}>
                            Filename:
                          </span>{' '}
                          <span style={{ color: '#6b7280' }}>
                            {chunk.filename}
                          </span>
                        </div>
                        {chunk.metadata && Object.entries(chunk.metadata).map(([key, value]) => (
                          <div key={key}>
                            <span style={{ fontWeight: 'bold', color: '#374151' }}>
                              {key}:
                            </span>{' '}
                            <span style={{ color: '#6b7280' }}>
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {chunks.length > 0 && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#f0f9ff',
          border: '1px solid #0ea5e9',
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          <strong>Search Summary:</strong> Found {chunks.length} passages. 
          Average score: {(chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length).toFixed(3)}.
          Top score: {Math.max(...chunks.map(c => c.score)).toFixed(3)}.
        </div>
      )}
    </div>
  );
};

export default RetrievedPassages;