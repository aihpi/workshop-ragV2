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
    
    Uses chat completions API format as specified for the custom embedding endpoint.
    """
    
    def __init__(self):
        """Initialize embedding service for OpenAI API."""
        self.client = openai.OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
        self.model = settings.OPENAI_EMBEDDING_MODEL
        self.embedding_dim = settings.OPENAI_EMBEDDING_DIM
    
    def _extract_embedding_from_response(self, response) -> List[float]:
        """Extract embedding vector from chat completion response.
        
        The custom API returns embeddings via chat completions format.
        This method handles parsing the response to extract the embedding.
        """
        # Try to get content from the response
        content = response.choices[0].message.content
        
        # The embedding might be returned as JSON in the content
        if content:
            import json
            try:
                # Try parsing as JSON array
                embedding = json.loads(content)
                if isinstance(embedding, list):
                    return embedding
            except (json.JSONDecodeError, TypeError):
                pass
        
        # If response has embedding attribute (standard OpenAI format)
        if hasattr(response, 'data') and response.data:
            return response.data[0].embedding
        
        # Fallback: try to access embedding from message
        message = response.choices[0].message
        if hasattr(message, 'embedding'):
            return message.embedding
        
        raise ValueError(f"Could not extract embedding from response: {response}")
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for single text using chat completions API."""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": text}],
            )
            return self._extract_embedding_from_response(response)
        except Exception as e:
            print(f"Error generating embedding: {e}")
            raise
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        embeddings = []
        for text in texts:
            embedding = self.embed_text(text)
            embeddings.append(embedding)
        return embeddings
    
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
