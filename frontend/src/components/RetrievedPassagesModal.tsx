import { theme } from '../theme';
import React from 'react';
import { RetrievedChunk } from '../services/api';

interface RetrievedPassagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunks: RetrievedChunk[];
}

const RetrievedPassagesModal: React.FC<RetrievedPassagesModalProps> = ({ isOpen, onClose, chunks }) => {
  if (!isOpen) return null;

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'theme.colors.layout.primary'; // green
    if (score >= 0.6) return '#d97706'; // orange
    if (score >= 0.4) return 'theme.colors.accent.primary'; // red
    return '#6b7280'; // gray
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Poor';
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.colors.white,
          borderRadius: '12px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid theme.colors.text.quaternary',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
            Retrieved Passages ({chunks.length})
          </h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'theme.colors.text.secondary',
              padding: '0',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'theme.colors.highlight.quaternary';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          {chunks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'theme.colors.text.secondary' }}>
              <p>No retrieved passages to display</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {chunks.map((chunk, index) => (
                <div
                  key={`${chunk.document_id}-${chunk.chunk_index}`}
                  style={{
                    border: '1px solid theme.colors.text.quaternary',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: 'theme.colors.highlight.quaternary',
                  }}
                >
                  {/* Chunk Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span
                          style={{
                            backgroundColor: 'theme.colors.accent.primary',
                            color: theme.colors.white,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          #{index + 1}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'theme.colors.text.primary' }}>
                          {chunk.filename}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'theme.colors.text.secondary' }}>
                        Chunk {chunk.chunk_index + 1}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: getScoreColor(chunk.score),
                        }}
                      >
                        {(chunk.score * 100).toFixed(1)}%
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: getScoreColor(chunk.score),
                          fontWeight: 'bold',
                        }}
                      >
                        {getScoreLabel(chunk.score)}
                      </div>
                    </div>
                  </div>

                  {/* Chunk Content */}
                  <div
                    style={{
                      backgroundColor: theme.colors.white,
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      color: 'theme.colors.text.primary',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {chunk.content}
                  </div>

                  {/* Metadata */}
                  {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                    <div
                      style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px solid theme.colors.text.quaternary',
                        fontSize: '12px',
                        color: 'theme.colors.text.secondary',
                      }}
                    >
                      <strong>Metadata:</strong>{' '}
                      {Object.entries(chunk.metadata).map(([key, value]) => (
                        <span key={key} style={{ marginLeft: '8px' }}>
                          {key}: {JSON.stringify(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid theme.colors.text.quaternary',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: 'theme.colors.accent.primary',
              color: theme.colors.white,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RetrievedPassagesModal;
