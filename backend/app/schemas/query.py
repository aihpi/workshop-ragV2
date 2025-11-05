"""Query-related Pydantic schemas."""
from pydantic import BaseModel, Field
from typing import List, Optional


class QueryRequest(BaseModel):
    """Request schema for RAG query."""
    query: str = Field(..., min_length=1, description="User query text")
    top_k: int = Field(5, ge=1, le=20, description="Number of relevant chunks to retrieve")
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="LLM temperature")
    max_tokens: int = Field(512, ge=1, le=2048, description="Maximum tokens to generate")
    top_p: float = Field(0.9, ge=0.0, le=1.0, description="Nucleus sampling parameter")
    top_k_sampling: int = Field(40, ge=1, le=100, description="Top-k sampling parameter")
    use_chat_history: bool = Field(False, description="Whether to use chat history")
    chat_id: Optional[str] = Field(None, description="Chat session ID")
    prompt: Optional[str] = Field(None, description="Custom prompt template")


class RetrievedChunk(BaseModel):
    """Schema for retrieved document chunk."""
    content: str
    document_id: str
    filename: str
    chunk_index: int
    score: float


class QueryResponse(BaseModel):
    """Response schema for RAG query."""
    query: str
    answer: str
    retrieved_chunks: List[RetrievedChunk]
    metadata: dict
