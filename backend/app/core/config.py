"""Configuration management for the RAG backend."""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings."""
    
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "RAG Backend"
    
    # CORS Settings
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # Qdrant Settings
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "documents"
    
    # Embedding Settings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384
    
    # LLM Settings
    VLLM_HOST: str = "localhost"
    VLLM_PORT: int = 8001
    LLM_MODEL: str = "meta-llama/Llama-3.2-3B-Instruct"
    LLM_MAX_TOKENS: int = 512
    LLM_TEMPERATURE: float = 0.7
    LLM_TOP_P: float = 0.9
    LLM_TOP_K: int = 40
    LLM_CONTEXT_WINDOW: int = 8192
    
    # Document Processing Settings
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128
    DATA_FOLDER: str = "../data"
    
    # Chat History Settings
    CHAT_HISTORY_FOLDER: str = "../chat_history"
    MAX_CHAT_HISTORY: int = 10
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
