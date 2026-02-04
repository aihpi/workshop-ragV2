"""Qdrant vector database service with Graph RAG support."""
from typing import List, Dict, Optional, Any, Union
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
    MatchAny,
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
                    size=settings.get_embedding_dim(),
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
        
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_embedding,
            limit=top_k,
            query_filter=query_filter,
        ).points
        
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
            doc_id = point.payload.get("document_id", "unknown")
            if doc_id not in documents:
                # Get filename and extract file_type if not present
                filename = point.payload.get("filename", "unknown")
                file_type = point.payload.get("file_type")
                if not file_type and filename:
                    # Extract extension from filename
                    import os
                    _, ext = os.path.splitext(filename)
                    file_type = ext if ext else "unknown"
                
                documents[doc_id] = {
                    "document_id": doc_id,
                    "filename": filename,
                    "file_type": file_type or "unknown",
                    "upload_date": point.payload.get("upload_date", "1970-01-01T00:00:00"),
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
    
    async def upsert_points(
        self,
        collection_name: str,
        points: List[Dict[str, Any]]
    ) -> None:
        """Upsert points with custom IDs and metadata.
        
        Args:
            collection_name: Target collection name
            points: List of points with id, vector, and payload
        """
        qdrant_points = []
        for point in points:
            # Generate UUID from string ID if needed
            point_id = point["id"]
            if isinstance(point_id, str) and not self._is_valid_uuid(point_id):
                # Hash the string ID to create a valid UUID
                hash_object = hashlib.sha256(point_id.encode())
                hex_dig = hash_object.hexdigest()
                point_id = f"{hex_dig[:8]}-{hex_dig[8:12]}-{hex_dig[12:16]}-{hex_dig[16:20]}-{hex_dig[20:32]}"
            
            qdrant_points.append(
                PointStruct(
                    id=point_id,
                    vector=point["vector"],
                    payload=point["payload"],
                )
            )
        
        self.client.upsert(
            collection_name=collection_name,
            points=qdrant_points,
        )
    
    def _is_valid_uuid(self, val: str) -> bool:
        """Check if string is a valid UUID."""
        try:
            uuid.UUID(str(val))
            return True
        except ValueError:
            return False
    
    def search_with_entity_filter(
        self,
        query_embedding: List[float],
        entity_ids: List[str],
        top_k: int = 5,
    ) -> List[Dict]:
        """Search for similar chunks filtered by entity IDs.
        
        Used for pre_filter Graph RAG strategy.
        
        Args:
            query_embedding: Query embedding vector
            entity_ids: List of entity IDs to filter by
            top_k: Number of results to return
            
        Returns:
            List of search results with scores
        """
        query_filter = Filter(
            must=[
                FieldCondition(
                    key="entity_id",
                    match=MatchAny(any=entity_ids),
                )
            ]
        )
        
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_embedding,
            limit=top_k,
            query_filter=query_filter,
        ).points
        
        return self._format_search_results(results)
    
    def search_with_metadata(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        document_id: Optional[str] = None,
        entity_type: Optional[str] = None,
    ) -> List[Dict]:
        """Search with optional metadata filters.
        
        Args:
            query_embedding: Query embedding vector
            top_k: Number of results to return
            document_id: Optional filter by document ID
            entity_type: Optional filter by entity type
            
        Returns:
            List of search results with enriched metadata
        """
        conditions = []
        
        if document_id:
            conditions.append(
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=document_id),
                )
            )
        
        if entity_type:
            conditions.append(
                FieldCondition(
                    key="entity_type",
                    match=MatchValue(value=entity_type),
                )
            )
        
        query_filter = Filter(must=conditions) if conditions else None
        
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_embedding,
            limit=top_k,
            query_filter=query_filter,
        ).points
        
        return self._format_search_results(results)
    
    def _format_search_results(self, results) -> List[Dict]:
        """Format search results with all available metadata.
        
        Args:
            results: Raw Qdrant search results
            
        Returns:
            Formatted results with metadata
        """
        formatted = []
        for result in results:
            item = {
                "content": result.payload.get("content", ""),
                "document_id": result.payload.get("document_id", ""),
                "filename": result.payload.get("filename", ""),
                "chunk_index": result.payload.get("chunk_index", 0),
                "score": result.score,
            }
            
            # Add enriched metadata if available
            if "entity_id" in result.payload:
                item["entity_id"] = result.payload["entity_id"]
            if "entity_type" in result.payload:
                item["entity_type"] = result.payload["entity_type"]
            if "bookmark_id" in result.payload:
                item["bookmark_id"] = result.payload["bookmark_id"]
            if "glossary_term_ids" in result.payload:
                item["glossary_term_ids"] = result.payload["glossary_term_ids"]
            if "status" in result.payload:
                item["status"] = result.payload["status"]
            if "anforderung_typ" in result.payload:
                item["anforderung_typ"] = result.payload["anforderung_typ"]
            if "baustein_code" in result.payload:
                item["baustein_code"] = result.payload["baustein_code"]
            if "roles" in result.payload:
                item["roles"] = result.payload["roles"]
            if "cross_references" in result.payload:
                item["cross_references"] = result.payload["cross_references"]
            
            formatted.append(item)
        
        return formatted
    
    def get_chunks_by_entity_ids(
        self,
        entity_ids: List[str],
        limit: int = 100
    ) -> List[Dict]:
        """Get all chunks for specific entity IDs.
        
        Used for post_enrich Graph RAG strategy.
        
        Args:
            entity_ids: List of entity IDs
            limit: Maximum chunks per entity
            
        Returns:
            List of chunks with metadata
        """
        all_chunks = []
        
        for entity_id in entity_ids:
            scroll_result = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="entity_id",
                            match=MatchValue(value=entity_id),
                        )
                    ]
                ),
                limit=limit,
            )
            
            for point in scroll_result[0]:
                chunk = {
                    "content": point.payload.get("content", ""),
                    "entity_id": entity_id,
                    "entity_type": point.payload.get("entity_type", ""),
                    "bookmark_id": point.payload.get("bookmark_id"),
                }
                all_chunks.append(chunk)
        
        return all_chunks
    
    def get_entity_ids_from_results(self, results: List[Dict]) -> List[str]:
        """Extract unique entity IDs from search results.
        
        Args:
            results: Search results
            
        Returns:
            List of unique entity IDs
        """
        entity_ids = set()
        for result in results:
            if "entity_id" in result:
                entity_ids.add(result["entity_id"])
        return list(entity_ids)
