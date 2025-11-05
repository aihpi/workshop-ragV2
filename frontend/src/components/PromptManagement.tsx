import React, { useState, useEffect } from 'react';

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description: string;
  isActive: boolean;
}

interface PromptManagementProps {
  prompts: PromptTemplate[];
  setPrompts: (prompts: PromptTemplate[]) => void;
}

const PromptManagement: React.FC<PromptManagementProps> = ({ prompts, setPrompts }) => {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    template: '',
    description: ''
  });

  useEffect(() => {
    const activePrompt = prompts.find(p => p.isActive);
    if (activePrompt) {
      setSelectedPrompt(activePrompt);
      setEditForm({
        name: activePrompt.name,
        template: activePrompt.template,
        description: activePrompt.description
      });
    } else if (prompts.length > 0) {
      // If no active prompt, select the first one
      setSelectedPrompt(prompts[0]);
      setEditForm({
        name: prompts[0].name,
        template: prompts[0].template,
        description: prompts[0].description
      });
    }
  }, [prompts]);

  const handleSavePrompt = () => {
    if (!selectedPrompt) return;

    const updatedPrompts = prompts.map(p => 
      p.id === selectedPrompt.id 
        ? { ...p, ...editForm }
        : p
    );
    setPrompts(updatedPrompts);
  };

  const handleCreateNew = () => {
    const newPrompt: PromptTemplate = {
      id: Date.now().toString(),
      name: 'New Prompt',
      template: `You are a helpful assistant. Answer the question below based on the provided context and chat history.

Context:
{context}

Chat history:
{history}

Question: 
{question}

Answer:`,
      description: 'New prompt template',
      isActive: false
    };

    setPrompts([...prompts, newPrompt]);
    setSelectedPrompt(newPrompt);
    setEditForm({
      name: newPrompt.name,
      template: newPrompt.template,
      description: newPrompt.description
    });
  };

  const handleSetActive = (promptId: string) => {
    const updatedPrompts = prompts.map(p => ({
      ...p,
      isActive: p.id === promptId
    }));
    setPrompts(updatedPrompts);
  };

  const handleDeletePrompt = (promptId: string) => {
    if (prompts.length <= 1) {
      alert('Cannot delete the last prompt. At least one prompt must exist.');
      return;
    }

    const promptToDelete = prompts.find(p => p.id === promptId);
    if (promptToDelete?.isActive) {
      // If deleting active prompt, make another one active
      const otherPrompt = prompts.find(p => p.id !== promptId);
      if (otherPrompt) {
        const updatedPrompts = prompts
          .filter(p => p.id !== promptId)
          .map(p => p.id === otherPrompt.id ? { ...p, isActive: true } : p);
        setPrompts(updatedPrompts);
      }
    } else {
      const updatedPrompts = prompts.filter(p => p.id !== promptId);
      setPrompts(updatedPrompts);
    }

    if (selectedPrompt?.id === promptId) {
      setSelectedPrompt(null);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', gap: '16px' }}>
      {/* Left Panel - Prompt List */}
      <div style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{ margin: 0 }}>Prompt Templates</h3>
          <button
            onClick={handleCreateNew}
            style={{
              padding: '8px 12px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            + New
          </button>
        </div>

        <div style={{ 
          flex: 1, 
          border: '1px solid #ddd', 
          borderRadius: '8px'
        }}>
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              style={{
                padding: '12px',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                backgroundColor: selectedPrompt?.id === prompt.id ? '#eff6ff' : 'white'
              }}
              onClick={() => {
                setSelectedPrompt(prompt);
                setEditForm({
                  name: prompt.name,
                  template: prompt.template,
                  description: prompt.description
                });
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '4px'
              }}>
                <span style={{ 
                  fontWeight: 'bold',
                  color: prompt.isActive ? '#059669' : '#374151'
                }}>
                  {prompt.name}
                  {prompt.isActive && <span style={{ color: '#059669' }}> ✓</span>}
                </span>
              </div>
              <div style={{ 
                fontSize: '12px', 
                color: '#666',
                marginBottom: '8px'
              }}>
                {prompt.description}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {!prompt.isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetActive(prompt.id);
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      backgroundColor: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Set Active
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this prompt?')) {
                      handleDeletePrompt(prompt.id);
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Prompt Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedPrompt ? (
          <>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{ margin: 0 }}>
                Edit Prompt
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleSavePrompt}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', gap: '16px', overflow: 'hidden' }}>
              {/* Left side - Form fields */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                      Prompt Name:
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        color: '#333333',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                      Description:
                    </label>
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        color: '#333333',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    Prompt Template:
                  </label>
                  <textarea
                    value={editForm.template}
                    onChange={(e) => setEditForm(prev => ({ ...prev, template: e.target.value }))}
                    style={{
                      width: '100%',
                      height: '400px',
                      padding: '12px',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      resize: 'none',
                      backgroundColor: '#ffffff',
                      color: '#333333',
                      lineHeight: '1.5',
                      boxSizing: 'border-box',
                      overflow: 'auto'
                    }}
                    placeholder="Enter your prompt template here..."
                  />
                </div>
              </div>

              {/* Right side - Placeholder info */}
              <div style={{ 
                width: '250px',
                padding: '12px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '6px',
                fontSize: '14px',
                alignSelf: 'stretch',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <strong style={{ marginBottom: '8px', display: 'block' }}>Available placeholders:</strong>
                <div style={{ lineHeight: '1.6' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <code style={{ backgroundColor: '#fff', padding: '2px 4px', borderRadius: '3px' }}>{'{context}'}</code> - Retrieved document passages
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    <code style={{ backgroundColor: '#fff', padding: '2px 4px', borderRadius: '3px' }}>{'{history}'}</code> - Conversation history
                  </div>
                  <div>
                    <code style={{ backgroundColor: '#fff', padding: '2px 4px', borderRadius: '3px' }}>{'{query}'}</code> or <code style={{ backgroundColor: '#fff', padding: '2px 4px', borderRadius: '3px' }}>{'{question}'}</code> - User's question
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: '#6b7280'
          }}>
            Select a prompt template to view or edit
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptManagement;