"""Configuration management for the RAG backend."""
from pydantic_settings import BaseSettings
from typing import List, Union, Literal
from pydantic import field_validator


class Settings(BaseSettings):
    """Application settings."""
    
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "RAG Backend"
    
    # CORS Settings
    BACKEND_CORS_ORIGINS: Union[List[str], str] = ["http://localhost:3000"]
    
    @field_validator('BACKEND_CORS_ORIGINS', mode='before')
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith('['):
            return [i.strip() for i in v.split(',')]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Qdrant Settings
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "documents"
    
    # Provider Selection
    LLM_PROVIDER: Literal["ollama", "openai"] = "ollama"
    EMBEDDING_PROVIDER: Literal["local", "openai"] = "local"
    
    # Embedding Settings (local SentenceTransformers)
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384  # Used when provider is "local"
    
    # OpenAI-compatible API Settings
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "http://10.127.129.0:4000"
    OPENAI_LLM_MODEL: str = "gpt-oss-120b"
    OPENAI_EMBEDDING_MODEL: str = "octen-embedding-8b"
    OPENAI_EMBEDDING_DIM: int = 4096  # Dimension for OpenAI embeddings
    
    # Ollama LLM Settings
    OLLAMA_HOST: str = "localhost"
    OLLAMA_PORT: int = 11434
    OLLAMA_MODEL: str = "qwen2.5:7b-instruct"
    LLM_MAX_TOKENS: int = 512
    LLM_TEMPERATURE: float = 0.7
    LLM_TOP_P: float = 0.9
    LLM_TOP_K: int = 40
    
    # Document Processing Settings
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128
    DATA_FOLDER: str = "../data"
    UPLOAD_FOLDER: str = "../uploads"
    
    # Chat History Settings
    CHAT_HISTORY_FOLDER: str = "../chat_history"
    MAX_CHAT_HISTORY: int = 10
    
    def get_embedding_dim(self) -> int:
        """Get embedding dimension based on provider."""
        if self.EMBEDDING_PROVIDER == "openai":
            return self.OPENAI_EMBEDDING_DIM
        return self.EMBEDDING_DIM
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
