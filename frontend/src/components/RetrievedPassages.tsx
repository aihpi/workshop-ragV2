import { theme } from '../theme';
import React, { useState, useRef } from 'react';
import { searchDocuments, RetrievedChunk } from '../services/api';

interface RAGChatState {
  messages: any[];
  query: string;
  isStreaming: boolean;
  showParameters: boolean;
  currentChunks: any[];
  currentAnswer: string;
  enableChatHistory: boolean;
  maxTokens: number;
  relevanceThreshold: number;
  topN: number;
  topK: number;
  temperature: number;
  topP: number;
}

interface RetrievedPassagesProps {
  ragChatState: RAGChatState;
  setRagChatState: React.Dispatch<React.SetStateAction<RAGChatState>>;
}

const RetrievedPassages: React.FC<RetrievedPassagesProps> = ({ ragChatState, setRagChatState }) => {
  const [localQuery, setLocalQuery] = useState('');
  const [chunks, setChunks] = useState<RetrievedChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { topK, relevanceThreshold } = ragChatState;

  const handleResetParameters = () => {
    setRagChatState(prev => ({
      ...prev,
      topK: 40,
      relevanceThreshold: 0.0,
      topN: 5,
      maxTokens: 300,
      temperature: 0.7,
      topP: 0.9,
    }));
  };

  const handleSearch = async () => {
    if (!localQuery.trim() || isLoading) return;

    console.log('Starting search with:', { query: localQuery, topK, relevanceThreshold });
    setIsLoading(true);
    try {
      const results = await searchDocuments(localQuery, topK, relevanceThreshold);
      console.log('Search results:', results);
      setChunks(results);
      
      if (results.length === 0) {
        alert(`No results found. Try adjusting the score threshold (currently ${relevanceThreshold.toFixed(2)}) or search for different terms.`);
      }
    } catch (error) {
      console.error('Search error:', error);
      alert(`Error searching documents: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return theme.colors.layout.primary;
    if (score >= 0.6) return '#d97706';
    if (score >= 0.4) return theme.colors.accent.primary;
    return '#6b7280';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Poor';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Results Area - Same position as messages in Chat view */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        padding: '16px 24px',
        marginBottom: '16px'
      }}>
        {chunks.length === 0 && !isLoading && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '200px',
            color: theme.colors.text.tertiary,
            fontSize: '16px'
          }}>
            Enter a search query to retrieve relevant passages
          </div>
        )}

        {isLoading && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '200px',
            color: theme.colors.text.secondary,
            fontSize: '16px'
          }}>
            Searching...
          </div>
        )}

        {chunks.length > 0 && !isLoading && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', color: theme.colors.text.primary }}>
              Retrieved Passages ({chunks.length} results)
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {chunks.map((chunk, index) => (
                <div
                  key={chunk.document_id + '-' + chunk.chunk_index}
                  style={{
                    border: `1px solid ${theme.colors.text.quaternary}`,
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: theme.colors.white
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: `1px solid ${theme.colors.text.quaternary}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontWeight: 'bold',
                        color: theme.colors.text.primary
                      }}>
                        Passage #{index + 1}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: theme.colors.white,
                        backgroundColor: getScoreColor(chunk.score)
                      }}>
                        {getScoreLabel(chunk.score)} ({chunk.score.toFixed(3)})
                      </span>
                    </div>
                    
                    {chunk.filename && (
                      <span style={{
                        fontSize: '12px',
                        color: theme.colors.text.tertiary,
                        fontFamily: 'monospace'
                      }}>
                        📄 {chunk.filename}
                      </span>
                    )}
                  </div>

                  <div style={{
                    lineHeight: '1.6',
                    color: theme.colors.text.primary
                  }}>
                    {chunk.content}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: theme.colors.highlight.quaternary,
              border: `1px solid ${theme.colors.layout.primary}`,
              borderRadius: '6px',
              fontSize: '14px',
              color: theme.colors.text.primary
            }}>
              <strong>Search Summary:</strong> Found {chunks.length} passages. 
              Average score: {(chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length).toFixed(3)}.
              Top score: {Math.max(...chunks.map(c => c.score)).toFixed(3)}.
            </div>
          </div>
        )}
      </div>

      {/* Query Input Form at Bottom - Matching RAGChat layout */}
      <form onSubmit={handleSubmit} style={{ 
        padding: '16px 0',
        borderTop: `1px solid ${theme.colors.text.quaternary}`,
        backgroundColor: theme.colors.white,
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <textarea
            ref={inputRef}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Enter your search query..."
            rows={3}
            style={{
              flex: 1,
              padding: '12px',
              border: `1px solid ${theme.colors.text.quaternary}`,
              borderRadius: '8px',
              resize: 'vertical',
              fontFamily: 'inherit',
              backgroundColor: theme.colors.white,
              color: theme.colors.text.primary
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!localQuery.trim() || isLoading}
            style={{
              padding: '12px 24px',
              backgroundColor: isLoading ? theme.colors.text.tertiary : theme.colors.accent.primary,
              color: theme.colors.white,
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isLoading ? 'Searching...' : 'Send'}
          </button>
        </div>

        {/* Parameters - Always shown below the input */}
        <div style={{
          marginTop: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '16px'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '14px',
              color: theme.colors.text.secondary,
              fontWeight: 'bold'
            }}>
              Top K Results: {topK}
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={topK}
              onChange={(e) => setRagChatState(prev => ({ ...prev, topK: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: theme.colors.layout.primary }}
            />
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '14px',
              color: theme.colors.text.secondary,
              fontWeight: 'bold'
            }}>
              Score Threshold: {relevanceThreshold.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={relevanceThreshold}
              onChange={(e) => setRagChatState(prev => ({ ...prev, relevanceThreshold: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: theme.colors.layout.primary }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={handleResetParameters}
              style={{
                padding: '8px 16px',
                backgroundColor: theme.colors.text.secondary,
                color: theme.colors.white,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default RetrievedPassages;
