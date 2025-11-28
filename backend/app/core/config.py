"""Configuration management for the RAG backend."""
from pydantic_settings import BaseSettings
from typing import List, Union
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
    
    # Embedding Settings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384
    
    # LLM Settings
    VLLM_HOST: str = "localhost"
    VLLM_PORT: int = 8001
    LLM_MODEL: str = "./models/Llama-3.2-3B-Instruct"
    LLM_MAX_TOKENS: int = 512
    LLM_TEMPERATURE: float = 0.7
    LLM_TOP_P: float = 0.9
    LLM_TOP_K: int = 40
    LLM_CONTEXT_WINDOW: int = 8192
    
    # Document Processing Settings
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128
    DATA_FOLDER: str = "../data"
    UPLOAD_FOLDER: str = "../uploads"
    
    # Chat History Settings
    CHAT_HISTORY_FOLDER: str = "../chat_history"
    MAX_CHAT_HISTORY: int = 10
    
    # Neo4j Settings
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "neo4jpassword"
    
    # Graph RAG Settings
    GRAPH_DEFAULT_DEPTH: int = 2
    GRAPH_MAX_DEPTH: int = 4
    GRAPH_MAX_NODES: int = 200
    
    # Job Persistence Settings
    JOB_RETENTION_DAYS: int = 30
    JOB_DB_PATH: str = "../jobs.db"
    MAX_ASYNC_WORKERS: int = 10
    
    # XML Processing Settings
    XML_PRESETS_FOLDER: str = "../xml_presets"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
