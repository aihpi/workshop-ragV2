"""Qdrant vector database service."""
from typing import List, Dict, Optional
import hashlib
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)
from app.core.config import settings


class QdrantService:
    """Service for interacting with Qdrant vector database."""
    
    def __init__(self):
        """Initialize Qdrant client."""
        self.client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )
        self.collection_name = settings.QDRANT_COLLECTION
        self._ensure_collection()
    
    def _generate_point_id(self, document_id: str, chunk_index: int) -> str:
        """Generate a valid UUID from document ID and chunk index.
        
        Args:
            document_id: Document identifier
            chunk_index: Chunk index
            
        Returns:
            Valid UUID string
        """
        # Create a deterministic UUID from document_id and chunk_index
        combined = f"{document_id}_{chunk_index}"
        hash_object = hashlib.sha256(combined.encode())
        hex_dig = hash_object.hexdigest()
        # Convert to UUID format
        uuid_str = f"{hex_dig[:8]}-{hex_dig[8:12]}-{hex_dig[12:16]}-{hex_dig[16:20]}-{hex_dig[20:32]}"
        return uuid_str
    
    def _ensure_collection(self):
        """Ensure collection exists, create if not."""
        collections = self.client.get_collections().collections
        collection_names = [col.name for col in collections]
        
        if self.collection_name not in collection_names:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=settings.EMBEDDING_DIM,
                    distance=Distance.COSINE,
                ),
            )
    
    def add_documents(
        self,
        document_id: str,
        chunks: List[str],
        embeddings: List[List[float]],
        metadata: dict,
    ):
        """Add document chunks to Qdrant.
        
        Args:
            document_id: Unique document identifier
            chunks: List of text chunks
            embeddings: List of embedding vectors
            metadata: Document metadata
        """
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = self._generate_point_id(document_id, i)
            payload = {
                "document_id": document_id,
                "chunk_index": i,
                "content": chunk,
                "filename": metadata["filename"],
                "file_type": metadata["file_type"],
                "upload_date": metadata["upload_date"],
            }
            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=payload,
                )
            )
        
        self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )
    
    def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        document_id: Optional[str] = None,
    ) -> List[Dict]:
        """Search for similar chunks.
        
        Args:
            query_embedding: Query embedding vector
            top_k: Number of results to return
            document_id: Optional filter by document ID
            
        Returns:
            List of search results with scores
        """
        query_filter = None
        if document_id:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            )
        
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            limit=top_k,
            query_filter=query_filter,
        )
        
        return [
            {
                "content": result.payload["content"],
                "document_id": result.payload["document_id"],
                "filename": result.payload["filename"],
                "chunk_index": result.payload["chunk_index"],
                "score": result.score,
            }
            for result in results
        ]
    
    def delete_document(self, document_id: str):
        """Delete all chunks of a document.
        
        Args:
            document_id: Document identifier to delete
        """
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
        )
    
    def get_all_documents(self) -> List[Dict]:
        """Get metadata for all documents.
        
        Returns:
            List of document metadata
        """
        # Get all points
        scroll_result = self.client.scroll(
            collection_name=self.collection_name,
            limit=10000,
        )
        
        # Group by document_id
        documents = {}
        for point in scroll_result[0]:
            doc_id = point.payload["document_id"]
            if doc_id not in documents:
                documents[doc_id] = {
                    "document_id": doc_id,
                    "filename": point.payload["filename"],
                    "file_type": point.payload["file_type"],
                    "upload_date": point.payload["upload_date"],
                    "num_chunks": 0,
                }
            documents[doc_id]["num_chunks"] += 1
        
        return list(documents.values())
    
    def document_exists(self, document_id: str) -> bool:
        """Check if document exists in database.
        
        Args:
            document_id: Document identifier
            
        Returns:
            True if document exists
        """
        result = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
            limit=1,
        )
        return len(result[0]) > 0
