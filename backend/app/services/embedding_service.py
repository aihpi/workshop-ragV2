"""Embedding service with provider abstraction (Local SentenceTransformers and OpenAI)."""
from abc import ABC, abstractmethod
from typing import List
import openai
from app.core.config import settings


class BaseEmbeddingService(ABC):
    """Abstract base class for embedding services."""
    
    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for single text.
        
        Args:
            text: Input text
            
        Returns:
            Embedding vector as list of floats
        """
        pass
    
    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts.
        
        Args:
            texts: List of input texts
            
        Returns:
            List of embedding vectors
        """
        pass
    
    @abstractmethod
    def get_embedding_dimension(self) -> int:
        """Get embedding dimension.
        
        Returns:
            Embedding dimension
        """
        pass


class LocalEmbeddingService(BaseEmbeddingService):
    """Service for generating embeddings using local SentenceTransformers."""
    
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        """Initialize embedding service.
        
        Args:
            model_name: Name of the SentenceTransformer model
        """
        from sentence_transformers import SentenceTransformer
        # Force CPU usage for embedding model
        self.model = SentenceTransformer(model_name, device='cpu')
        self.embedding_dim = self.model.get_sentence_embedding_dimension()
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for single text."""
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.tolist()
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()
    
    def get_embedding_dimension(self) -> int:
        """Get embedding dimension."""
        return self.embedding_dim


class OpenAIEmbeddingService(BaseEmbeddingService):
    """Service for generating embeddings using OpenAI-compatible API.
    
    Uses the standard OpenAI embeddings endpoint (/v1/embeddings).
    """
    
    def __init__(self):
        """Initialize embedding service for OpenAI API."""
        self.client = openai.OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
        self.model = settings.OPENAI_EMBEDDING_MODEL
        self.embedding_dim = settings.OPENAI_EMBEDDING_DIM
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for single text using embeddings API."""
        try:
            response = self.client.embeddings.create(
                model=self.model,
                input=text,
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error generating embedding: {e}")
            raise
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        try:
            # OpenAI embeddings API supports batch input
            response = self.client.embeddings.create(
                model=self.model,
                input=texts,
            )
            # Sort by index to ensure correct order
            sorted_data = sorted(response.data, key=lambda x: x.index)
            return [item.embedding for item in sorted_data]
        except Exception as e:
            print(f"Error generating embeddings: {e}")
            raise
    
    def get_embedding_dimension(self) -> int:
        """Get embedding dimension."""
        return self.embedding_dim


# Backward compatibility alias
EmbeddingService = LocalEmbeddingService


def get_embedding_service() -> BaseEmbeddingService:
    """Factory function to get the appropriate embedding service based on config."""
    if settings.EMBEDDING_PROVIDER == "openai":
        return OpenAIEmbeddingService()
    return LocalEmbeddingService(model_name=settings.EMBEDDING_MODEL)
