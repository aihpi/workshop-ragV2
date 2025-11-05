"""Document-related Pydantic schemas."""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class DocumentMetadata(BaseModel):
    """Document metadata schema."""
    filename: str
    file_type: str
    file_size: int
    upload_date: datetime
    document_id: str
    num_chunks: int


class DocumentChunk(BaseModel):
    """Document chunk schema."""
    chunk_id: str
    document_id: str
    content: str
    chunk_index: int
    metadata: dict


class DocumentUploadResponse(BaseModel):
    """Response for document upload."""
    success: bool
    message: str
    document_id: str
    filename: str
    num_chunks: int


class DocumentListResponse(BaseModel):
    """Response for document list."""
    documents: List[DocumentMetadata]
    total: int


class DocumentDeleteResponse(BaseModel):
    """Response for document deletion."""
    success: bool
    message: str
    document_id: str
