"""Document management API routes."""
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
import shutil
from pathlib import Path
import os

from app.schemas import (
    DocumentUploadResponse,
    DocumentListResponse,
    DocumentDeleteResponse,
    DocumentMetadata,
)
from app.services import (
    DocumentProcessor,
    EmbeddingService,
    QdrantService,
)
from app.core.config import settings

router = APIRouter()

# Initialize services
doc_processor = DocumentProcessor(
    chunk_size=settings.CHUNK_SIZE,
    chunk_overlap=settings.CHUNK_OVERLAP,
)
embedding_service = EmbeddingService(model_name=settings.EMBEDDING_MODEL)
qdrant_service = QdrantService()

# Ensure data folder exists
DATA_FOLDER = Path(settings.DATA_FOLDER)
DATA_FOLDER.mkdir(parents=True, exist_ok=True)


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload and process a document.
    
    Args:
        file: Uploaded file
        
    Returns:
        Upload response with document metadata
    """
    try:
        # Save uploaded file
        file_path = DATA_FOLDER / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process document
        document_id, chunks, metadata = doc_processor.process_document(str(file_path))
        
        # Check if document already exists
        if qdrant_service.document_exists(document_id):
            return DocumentUploadResponse(
                success=True,
                message="Document already exists (same content hash)",
                document_id=document_id,
                filename=metadata["filename"],
                num_chunks=metadata["num_chunks"],
            )
        
        # Generate embeddings
        embeddings = embedding_service.embed_texts(chunks)
        
        # Store in Qdrant
        qdrant_service.add_documents(
            document_id=document_id,
            chunks=chunks,
            embeddings=embeddings,
            metadata=metadata,
        )
        
        return DocumentUploadResponse(
            success=True,
            message="Document uploaded and processed successfully",
            document_id=document_id,
            filename=metadata["filename"],
            num_chunks=metadata["num_chunks"],
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@router.get("/list", response_model=DocumentListResponse)
async def list_documents():
    """List all documents in the database.
    
    Returns:
        List of document metadata
    """
    try:
        documents = qdrant_service.get_all_documents()
        
        # Add file size from disk if available
        for doc in documents:
            file_path = DATA_FOLDER / doc["filename"]
            if file_path.exists():
                doc["file_size"] = os.path.getsize(file_path)
            else:
                doc["file_size"] = 0
        
        return DocumentListResponse(
            documents=[DocumentMetadata(**doc) for doc in documents],
            total=len(documents),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing documents: {str(e)}")


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
async def delete_document(document_id: str):
    """Delete a document from the database.
    
    Args:
        document_id: Document ID to delete
        
    Returns:
        Deletion response
    """
    try:
        if not qdrant_service.document_exists(document_id):
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete from Qdrant
        qdrant_service.delete_document(document_id)
        
        # Note: We don't delete the file from disk as multiple documents might have the same content
        # but different filenames
        
        return DocumentDeleteResponse(
            success=True,
            message="Document deleted successfully",
            document_id=document_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting document: {str(e)}")


@router.post("/sync")
async def sync_documents():
    """Sync documents from data folder to database.
    
    Scans the data folder and uploads any new documents.
    
    Returns:
        Sync status
    """
    try:
        synced = []
        skipped = []
        errors = []
        
        for file_path in DATA_FOLDER.glob("*"):
            if file_path.is_file():
                try:
                    # Process document
                    document_id, chunks, metadata = doc_processor.process_document(str(file_path))
                    
                    # Check if already exists
                    if qdrant_service.document_exists(document_id):
                        skipped.append(file_path.name)
                        continue
                    
                    # Generate embeddings and store
                    embeddings = embedding_service.embed_texts(chunks)
                    qdrant_service.add_documents(
                        document_id=document_id,
                        chunks=chunks,
                        embeddings=embeddings,
                        metadata=metadata,
                    )
                    synced.append(file_path.name)
                
                except Exception as e:
                    errors.append({"file": file_path.name, "error": str(e)})
        
        return {
            "success": True,
            "synced": synced,
            "skipped": skipped,
            "errors": errors,
            "total_synced": len(synced),
            "total_skipped": len(skipped),
            "total_errors": len(errors),
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing documents: {str(e)}")
