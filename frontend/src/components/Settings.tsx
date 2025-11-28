import React, { useState, useEffect, useCallback } from 'react';
import PromptManagement from './PromptManagement';
import DocumentManagement from './DocumentManagement';
import { theme } from '../theme';
import { 
  uploadXMLFile, 
  getXMLJobs, 
  deleteXMLJob, 
  streamJobProgress, 
  getGraphStats, 
  getXMLPresets,
  XMLJob,
  XMLPreset
} from '../services/api';

interface SettingsProps {
  onBackToChat?: () => void;
  prompts?: any[];
  setPrompts?: (prompts: any[]) => void;
}

type SettingsSection = 
  | 'prompt-management' 
  | 'query-transformation' 
  | 'data' 
  | 'xml-processing'
  | 'customize' 
  | 'model-configuration' 
  | 'information';

const Settings: React.FC<SettingsProps> = ({ onBackToChat, prompts, setPrompts }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('prompt-management');

  const settingsSections = [
    { id: 'prompt-management' as const, label: 'Prompt Management', icon: '📝' },
    { id: 'query-transformation' as const, label: 'Query Transformation', icon: '🔄' },
    { id: 'data' as const, label: 'Data', icon: '📊' },
    { id: 'xml-processing' as const, label: 'XML Processing', icon: '🗂️' },
    { id: 'customize' as const, label: 'Customize', icon: '⚙️' },
    { id: 'model-configuration' as const, label: 'Model Configuration', icon: '🤖' },
    { id: 'information' as const, label: 'Information', icon: 'ℹ️' },
  ];

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      fontFamily: theme.fonts.family,
    }}>
      {/* Settings Sidebar */}
      <div style={{
        width: '280px',
        backgroundColor: theme.colors.white,
        borderRight: `1px solid ${theme.colors.text.quaternary}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'relative',
      }}>
        {/* Scrollable content area */}
        <div style={{ 
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '16px' }}>
            {/* Logo with invisible spacer for alignment */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <img 
                src="/img/logo_aisc_bmftr.jpg" 
                alt="Logo" 
                style={{ 
                  width: 'calc(100% - 40px)',
                  height: 'auto',
                  objectFit: 'contain',
                }} 
              />
              <div style={{ width: '32px' }}></div>
            </div>
            
            {settingsSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                width: '100%',
                padding: '12px 16px',
                marginBottom: '8px',
                backgroundColor: activeSection === section.id ? theme.colors.accent.quaternary : theme.colors.white,
                border: `1px solid ${activeSection === section.id ? theme.colors.accent.primary : theme.colors.text.quaternary}`,
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: activeSection === section.id ? theme.fonts.weight.bold : theme.fonts.weight.regular,
                color: activeSection === section.id ? theme.colors.accent.primary : theme.colors.text.primary,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (activeSection !== section.id) {
                  e.currentTarget.style.backgroundColor = theme.colors.highlight.quaternary;
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== section.id) {
                  e.currentTarget.style.backgroundColor = theme.colors.white;
                }
              }}
            >
              <span style={{ fontSize: '18px' }}>{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
          </div>
        </div>

        {/* Fixed Bottom Section - Back to Chat Button */}
        {onBackToChat && (
          <div style={{
            padding: '16px',
            borderTop: `1px solid ${theme.colors.text.quaternary}`,
            backgroundColor: theme.colors.white,
          }}>
            <button
              onClick={onBackToChat}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: theme.colors.text.secondary,
                color: theme.colors.white,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: theme.fonts.weight.bold,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.text.primary}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.text.secondary}
            >
              ⚙️ Back to Chat
            </button>
          </div>
        )}
      </div>

      {/* Settings Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        width: '100%',
      }}>
        <div style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto',
          width: '100%',
          maxWidth: '100%',
        }}>
          {activeSection === 'prompt-management' && <PromptManagementSection prompts={prompts} setPrompts={setPrompts} />}
          {activeSection === 'query-transformation' && <QueryTransformationSection />}
          {activeSection === 'data' && <DataSection />}
          {activeSection === 'xml-processing' && <XMLProcessingSection />}
          {activeSection === 'customize' && <CustomizeSection />}
          {activeSection === 'model-configuration' && <ModelConfigurationSection />}
          {activeSection === 'information' && <InformationSection />}
        </div>
      </div>
    </div>
  );
};

// Individual Settings Sections

interface PromptManagementSectionProps {
  prompts?: any[];
  setPrompts?: (prompts: any[]) => void;
}

const PromptManagementSection: React.FC<PromptManagementSectionProps> = ({ prompts, setPrompts }) => {
  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>Prompt Management</h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: '24px' }}>
        Create and manage prompt templates for RAG queries. Set which prompt is active for chat responses.
      </p>
      {prompts && setPrompts ? (
        <PromptManagement prompts={prompts} setPrompts={setPrompts} />
      ) : (
        <div style={{
          padding: '24px',
          backgroundColor: "transparent",
          borderRadius: '8px',
          textAlign: 'center',
        }}>
          <p>Prompt management will be integrated when connected to App state</p>
        </div>
      )}
      <ResetButton section="Prompt Management" />
    </div>
  );
};

const QueryTransformationSection: React.FC = () => {
  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>Query Transformation</h2>
      <div style={{
        padding: '16px',
        backgroundColor: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: '8px',
        marginBottom: '24px',
      }}>
        <p style={{ margin: 0, fontWeight: 'bold' }}>⚠️ Under Development</p>
        <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
          Query transformation features are currently being developed and will be available in a future update.
        </p>
      </div>
      <p style={{ color: theme.colors.text.secondary }}>
        This section will allow you to configure how user queries are transformed and enhanced before being sent to the retrieval system.
      </p>
      <ResetButton section="Query Transformation" disabled />
    </div>
  );
};

const DataSection: React.FC = () => {
  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>Data Management</h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: '24px' }}>
        Upload new documents, delete existing documents, and view storage statistics.
      </p>
      <DocumentManagement />
      <ResetButton section="Data" disabled />
    </div>
  );
};

interface GraphStatsData {
  total_nodes: number;
  total_relationships: number;
  total_documents: number;
  nodes_by_type: Record<string, number>;
  relationships_by_type: Record<string, number>;
}

const XMLProcessingSection: React.FC = () => {
  const [jobs, setJobs] = useState<XMLJob[]>([]);
  const [presets, setPresets] = useState<XMLPreset[]>([]);
  const [graphStats, setGraphStats] = useState<GraphStatsData | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJobProgress, setActiveJobProgress] = useState<Record<string, number>>({});

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const [jobsResponse, presetsData, statsData] = await Promise.all([
        getXMLJobs(),
        getXMLPresets(),
        getGraphStats().catch(() => null)  // Graph stats may fail if Neo4j not connected
      ]);
      setJobs(jobsResponse.jobs || []);
      setPresets(presetsData);
      if (statsData) setGraphStats(statsData);
      if (presetsData.length > 0 && !selectedPreset) {
        setSelectedPreset(presetsData[0].name);
      }
    } catch (err) {
      console.error('Failed to load XML processing data:', err);
    }
  }, [selectedPreset]);

  useEffect(() => {
    loadData();
    // Poll for job updates every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Stream progress for active jobs
  useEffect(() => {
    const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending');
    activeJobs.forEach(job => {
      if (!activeJobProgress[job.job_id]) {
        streamJobProgress(
          job.job_id,
          (progress) => {
            setActiveJobProgress(prev => ({ ...prev, [job.job_id]: progress.progress * 100 }));
          },
          () => {
            loadData();
          },
          (error) => {
            console.error('Job progress error:', error);
            loadData();
          }
        );
        // Store cleanup (simplified - just mark as tracked)
        setActiveJobProgress(prev => ({ ...prev, [job.job_id]: job.progress }));
      }
    });
  }, [jobs, activeJobProgress, loadData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xml')) {
        setError('Please select an XML file');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedPreset) {
      setError('Please select a file and preset');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await uploadXMLFile(selectedFile, { preset_name: selectedPreset });
      // Refresh jobs list after upload
      loadData();
      setSelectedFile(null);
      // Reset file input
      const fileInput = document.getElementById('xml-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      setError(err.message || 'Failed to upload XML document');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job and its data?')) return;
    
    try {
      await deleteXMLJob(jobId);
      setJobs(prev => prev.filter(j => j.job_id !== jobId));
      loadData(); // Refresh stats
    } catch (err: any) {
      setError(err.message || 'Failed to delete job');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#059669';
      case 'running': return '#0284c7';
      case 'pending': return '#d97706';
      case 'failed': return '#dc2626';
      default: return theme.colors.text.secondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '⏳';
      case 'pending': return '🕐';
      case 'failed': return '❌';
      default: return '❓';
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>XML Processing</h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: '24px' }}>
        Upload and process XML documents to extract entities and build the knowledge graph.
      </p>

      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #dc2626',
          borderRadius: '8px',
          marginBottom: '16px',
          color: '#dc2626'
        }}>
          {error}
        </div>
      )}

      {/* Upload Section */}
      <div style={{
        padding: '20px',
        backgroundColor: theme.colors.white,
        border: `1px solid ${theme.colors.text.quaternary}`,
        borderRadius: '8px',
        marginBottom: '24px'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Upload XML Document</h3>
        
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Preset Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
              Document Type Preset
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${theme.colors.text.quaternary}`,
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: theme.colors.white
              }}
            >
              {presets.map(preset => (
                <option key={preset.name} value={preset.name}>
                  {preset.name} - {preset.description}
                </option>
              ))}
            </select>
          </div>

          {/* File Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
              XML File
            </label>
            <input
              id="xml-file-input"
              type="file"
              accept=".xml"
              onChange={handleFileSelect}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${theme.colors.text.quaternary}`,
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: theme.colors.white
              }}
            />
            {selectedFile && (
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: theme.colors.text.secondary }}>
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile || !selectedPreset}
            style={{
              padding: '12px 24px',
              backgroundColor: uploading || !selectedFile ? theme.colors.text.tertiary : theme.colors.accent.primary,
              color: theme.colors.white,
              border: 'none',
              borderRadius: '6px',
              cursor: uploading || !selectedFile ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {uploading ? (
              <>⏳ Uploading...</>
            ) : (
              <>📤 Upload & Process</>
            )}
          </button>
        </div>
      </div>

      {/* Graph Statistics */}
      {graphStats && (
        <div style={{
          padding: '20px',
          backgroundColor: theme.colors.white,
          border: `1px solid ${theme.colors.text.quaternary}`,
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>🕸️ Knowledge Graph Statistics</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
            <div style={{
              padding: '16px',
              backgroundColor: '#f0f9ff',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>
                {graphStats.total_nodes.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: theme.colors.text.secondary, marginTop: '4px' }}>
                Total Nodes
              </div>
            </div>
            
            <div style={{
              padding: '16px',
              backgroundColor: '#f0fdf4',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                {graphStats.total_relationships.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: theme.colors.text.secondary, marginTop: '4px' }}>
                Relationships
              </div>
            </div>
          </div>

          {Object.keys(graphStats.nodes_by_type).length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: theme.colors.text.secondary }}>
                Nodes by Type
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(graphStats.nodes_by_type).map(([type, count]) => (
                  <span
                    key={type}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '16px',
                      fontSize: '12px'
                    }}
                  >
                    {type}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Jobs List */}
      <div style={{
        padding: '20px',
        backgroundColor: theme.colors.white,
        border: `1px solid ${theme.colors.text.quaternary}`,
        borderRadius: '8px'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>📋 Processing Jobs</h3>
        
        {jobs.length === 0 ? (
          <p style={{ color: theme.colors.text.secondary, textAlign: 'center', padding: '24px' }}>
            No XML processing jobs yet. Upload a document to get started.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {jobs.map(job => (
              <div
                key={job.job_id}
                style={{
                  padding: '16px',
                  border: `1px solid ${theme.colors.text.quaternary}`,
                  borderRadius: '8px',
                  backgroundColor: '#fafafa'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span>{getStatusIcon(job.status)}</span>
                      <span style={{ 
                        fontWeight: 'bold',
                        color: getStatusColor(job.status),
                        textTransform: 'capitalize'
                      }}>
                        {job.status}
                      </span>
                      <span style={{ 
                        fontSize: '12px', 
                        color: theme.colors.text.secondary,
                        backgroundColor: '#e5e7eb',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {job.preset_name}
                      </span>
                    </div>
                    
                    <p style={{ 
                      margin: '0 0 8px 0', 
                      fontSize: '14px',
                      fontFamily: 'monospace',
                      color: theme.colors.text.secondary,
                      wordBreak: 'break-all'
                    }}>
                      {job.filename}
                    </p>
                    
                    {/* Progress Bar */}
                    {(job.status === 'running' || job.status === 'pending') && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{
                          height: '8px',
                          backgroundColor: '#e5e7eb',
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${activeJobProgress[job.job_id] || job.progress}%`,
                            backgroundColor: '#0284c7',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: theme.colors.text.secondary }}>
                          {(activeJobProgress[job.job_id] || job.progress).toFixed(1)}% complete
                        </p>
                      </div>
                    )}

                    {/* Completion Stats */}
                    {job.status === 'completed' && (
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: theme.colors.text.secondary }}>
                        <span>📄 {job.total_chunks} chunks</span>
                        <span>🕸️ {job.total_nodes} nodes</span>
                        <span>🔗 {job.total_relationships} relationships</span>
                      </div>
                    )}

                    {/* Error Message */}
                    {job.status === 'failed' && job.error_message && (
                      <p style={{ 
                        margin: '8px 0 0 0', 
                        fontSize: '12px', 
                        color: '#dc2626',
                        backgroundColor: '#fef2f2',
                        padding: '8px',
                        borderRadius: '4px'
                      }}>
                        {job.error_message}
                      </p>
                    )}

                    <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: theme.colors.text.tertiary }}>
                      Created: {new Date(job.created_at).toLocaleString()}
                      {job.completed_at && ` • Completed: ${new Date(job.completed_at).toLocaleString()}`}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => handleDeleteJob(job.job_id)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'transparent',
                      color: '#dc2626',
                      border: '1px solid #dc2626',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      marginLeft: '16px'
                    }}
                    title="Delete job and associated data"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ResetButton section="XML Processing" disabled />
    </div>
  );
};

const CustomizeSection: React.FC = () => {
  const [maxTokens, setMaxTokens] = useState(300);
  const [relevanceThreshold, setRelevanceThreshold] = useState(0.7);
  const [topN, setTopN] = useState(5);
  const [topK, setTopK] = useState(40);
  const [temperature, setTemperature] = useState(0.3);
  const [topP, setTopP] = useState(0.9);

  const handleReset = () => {
    setMaxTokens(300);
    setRelevanceThreshold(0.7);
    setTopN(5);
    setTopK(40);
    setTemperature(0.3);
    setTopP(0.9);
  };

  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>Customize Parameters</h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: '24px' }}>
        Adjust generation and retrieval parameters to customize system behavior.
      </p>

      <div style={{ display: 'grid', gap: '24px' }}>
        {/* Max Tokens */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Max Tokens: {maxTokens}
          </label>
          <input
            type="range"
            min="50"
            max="2000"
            step="50"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Maximum number of tokens in the generated response
          </p>
        </div>

        {/* Relevance Threshold */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Relevance Threshold: {relevanceThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={relevanceThreshold}
            onChange={(e) => setRelevanceThreshold(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Minimum similarity score for retrieved passages
          </p>
        </div>

        {/* Top N Results */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Top N Results: {topN}
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Number of passages to retrieve from the database
          </p>
        </div>

        {/* Top-k */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Top-k Sampling: {topK}
          </label>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Limits vocabulary to top-k most likely tokens during generation
          </p>
        </div>

        {/* Temperature */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Temperature: {temperature.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Controls randomness in responses (lower = more focused, higher = more creative)
          </p>
        </div>

        {/* Top-p */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Top-p (Nucleus Sampling): {topP.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={topP}
            onChange={(e) => setTopP(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Considers tokens with cumulative probability up to this value
          </p>
        </div>
      </div>

      <ResetButton section="Customize" onReset={handleReset} />
    </div>
  );
};

const ModelConfigurationSection: React.FC = () => {
  const [embeddingModel, setEmbeddingModel] = useState('sentence-transformers/all-MiniLM-L6-v2');
  const [chunkSize, setChunkSize] = useState(512);
  const [chunkOverlap, setChunkOverlap] = useState(128);

  const handleReset = () => {
    setEmbeddingModel('sentence-transformers/all-MiniLM-L6-v2');
    setChunkSize(512);
    setChunkOverlap(128);
  };

  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>Model Configuration</h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: '24px' }}>
        Configure embedding models and document processing parameters.
      </p>

      <div style={{ display: 'grid', gap: '24px' }}>
        {/* Embedding Model */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Embedding Model
          </label>
          <input
            type="text"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="e.g., sentence-transformers/all-MiniLM-L6-v2"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${theme.colors.text.quaternary}`,
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            HuggingFace model ID for text embeddings
          </p>
        </div>

        {/* Chunk Size */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Chunk Size: {chunkSize} tokens
          </label>
          <input
            type="range"
            min="128"
            max="2048"
            step="128"
            value={chunkSize}
            onChange={(e) => setChunkSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Maximum size of document chunks for embedding
          </p>
        </div>

        {/* Chunk Overlap */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Chunk Overlap: {chunkOverlap} tokens
          </label>
          <input
            type="range"
            min="0"
            max="512"
            step="32"
            value={chunkOverlap}
            onChange={(e) => setChunkOverlap(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.colors.layout.primary }}
          />
          <p style={{ fontSize: '12px', color: theme.colors.text.secondary, margin: '4px 0 0 0' }}>
            Number of overlapping tokens between consecutive chunks
          </p>
        </div>

        {/* LLM Model Info */}
        <div style={{
          padding: '16px',
          backgroundColor: "transparent",
          borderRadius: '8px',
          border: `1px solid ${theme.colors.text.quaternary}`,
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Current LLM Model</h3>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
            Use the model selector in the top-right corner to switch LLM models.
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: theme.colors.text.secondary }}>
            The active model is used for generating chat responses.
          </p>
        </div>
      </div>

      <ResetButton section="Model Configuration" onReset={handleReset} />
    </div>
  );
};

const InformationSection: React.FC = () => {
  const systemInfo = {
    backendUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
    vectorDatabase: 'Qdrant',
    vectorDimensions: 384,
    supportEmail: 'kisz@hpi.de',
  };

  return (
    <div style={{ width: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>System Information</h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: '24px' }}>
        Technical details about the RAG system configuration and support contact.
      </p>

      <div style={{ display: 'grid', gap: '16px' }}>
        {/* API Endpoint */}
        <div style={{
          padding: '16px',
          backgroundColor: "transparent",
          borderRadius: '8px',
          border: `1px solid ${theme.colors.text.quaternary}`,
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.colors.text.secondary }}>API Endpoint</h3>
          <p style={{ margin: 0, fontSize: '16px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {systemInfo.backendUrl}
          </p>
        </div>

        {/* Vector Database */}
        <div style={{
          padding: '16px',
          backgroundColor: "transparent",
          borderRadius: '8px',
          border: `1px solid ${theme.colors.text.quaternary}`,
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.colors.text.secondary }}>Vector Database</h3>
          <p style={{ margin: 0, fontSize: '16px' }}>{systemInfo.vectorDatabase}</p>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: theme.colors.text.secondary }}>
            Dimensions: {systemInfo.vectorDimensions}
          </p>
        </div>

        {/* Embedding Model */}
        <div style={{
          padding: '16px',
          backgroundColor: "transparent",
          borderRadius: '8px',
          border: `1px solid ${theme.colors.text.quaternary}`,
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.colors.text.secondary }}>Embedding Model</h3>
          <p style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {systemInfo.embeddingModel}
          </p>
        </div>

        {/* Support Contact */}
        <div style={{
          padding: '16px',
          backgroundColor: 'transparent',
          borderRadius: '8px',
          border: '1px solid #007bff',
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.colors.accent.primary }}>Support Contact</h3>
          <p style={{ margin: 0, fontSize: '16px' }}>
            <a href={`mailto:${systemInfo.supportEmail}`} style={{ color: theme.colors.accent.primary, textDecoration: 'none' }}>
              {systemInfo.supportEmail}
            </a>
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: theme.colors.text.secondary }}>
            For technical support and questions about the RAG system
          </p>
        </div>

        {/* Backend Status */}
        <div style={{
          padding: '16px',
          backgroundColor: "transparent",
          borderRadius: '8px',
          border: `1px solid ${theme.colors.text.quaternary}`,
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.colors.text.secondary }}>Backend Status</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              backgroundColor: '#059669',
              display: 'inline-block'
            }}></span>
            <span style={{ fontSize: '16px', color: '#059669' }}>Connected</span>
          </div>
        </div>
      </div>

      <ResetButton section="Information" disabled />
    </div>
  );
};

// Reset Button Component
interface ResetButtonProps {
  section: string;
  onReset?: () => void;
  disabled?: boolean;
}

const ResetButton: React.FC<ResetButtonProps> = ({ section, onReset, disabled = false }) => {
  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      alert(`Reset ${section} settings to defaults`);
    }
  };

  return (
    <div style={{
      marginTop: '32px',
      paddingTop: '24px',
      borderTop: `1px solid ${theme.colors.text.quaternary}`,
    }}>
      <button
        onClick={handleReset}
        disabled={disabled}
        style={{
          padding: '10px 20px',
          backgroundColor: disabled ? theme.colors.text.tertiary : theme.colors.accent.primary,
          color: theme.colors.white,
          border: 'none',
          borderRadius: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        🔄 Reset {section} Settings
      </button>
      {disabled && (
        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: theme.colors.text.secondary }}>
          This section has no customizable settings to reset
        </p>
      )}
    </div>
  );
};

export default Settings;
