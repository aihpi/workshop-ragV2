import React, { useState } from 'react';
import { queryRAGStream, RetrievedChunk } from '../services/api';

const QueryInterface: React.FC = () => {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [chunks, setChunks] = useState<RetrievedChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Parameters
  const [topK, setTopK] = useState(5);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [topP, setTopP] = useState(0.9);
  const [topKSampling, setTopKSampling] = useState(40);

  const handleQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setAnswer('');
    setChunks([]);

    try {
      queryRAGStream(
        {
          query,
          top_k: topK,
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          top_k_sampling: topKSampling,
        },
        (token) => {
          setAnswer((prev) => prev + token);
        },
        (retrievedChunks) => {
          setChunks(retrievedChunks);
        },
        () => {
          setLoading(false);
        },
        (errorMsg) => {
          setError(errorMsg);
          setLoading(false);
        }
      );
    } catch (err) {
      setError('Failed to query');
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Query Documents</h2>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="form-group">
          <label>Your Question</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your question here..."
          />
        </div>

        <div className="controls-grid">
          <div className="slider-group">
            <label>
              <span>Top K Results</span>
              <span>{topK}</span>
            </label>
            <input
              type="range"
              min="1"
              max="20"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Temperature</span>
              <span>{temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Max Tokens</span>
              <span>{maxTokens}</span>
            </label>
            <input
              type="range"
              min="128"
              max="2048"
              step="128"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Top P</span>
              <span>{topP.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(Number(e.target.value))}
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Top K Sampling</span>
              <span>{topKSampling}</span>
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={topKSampling}
              onChange={(e) => setTopKSampling(Number(e.target.value))}
            />
          </div>
        </div>

        <button onClick={handleQuery} disabled={loading}>
          {loading ? 'Processing...' : 'Ask Question'}
        </button>
      </div>

      {(answer || loading) && (
        <div className="card">
          <h3>Answer</h3>
          <div className="answer-box">
            {answer || <span style={{ color: '#888' }}>Generating answer...</span>}
          </div>
        </div>
      )}

      {chunks.length > 0 && (
        <div className="card chunks-box">
          <h3>Retrieved Chunks ({chunks.length})</h3>
          {chunks.map((chunk, idx) => (
            <div key={idx} className="chunk-item">
              <div className="chunk-header">
                <span>{chunk.filename} (Chunk {chunk.chunk_index})</span>
                <span>Score: {chunk.score.toFixed(4)}</span>
              </div>
              <div className="chunk-content">{chunk.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QueryInterface;
