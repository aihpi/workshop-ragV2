"""Main FastAPI application for RAG backend."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from qdrant_client import QdrantClient
from app.core.config import settings
from app.api import api_router
from app.services.embedding_service import get_embedding_service


async def check_qdrant_dimension_compatibility():
    """Check if Qdrant collection dimension matches embedding service dimension.
    
    Returns:
        Tuple of (is_compatible, collection_dim, expected_dim, collection_exists)
    """
    try:
        client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )
        
        # Check if collection exists
        collections = client.get_collections().collections
        collection_names = [col.name for col in collections]
        
        if settings.QDRANT_COLLECTION not in collection_names:
            return True, None, settings.get_embedding_dim(), False
        
        # Get collection info
        collection_info = client.get_collection(settings.QDRANT_COLLECTION)
        
        # Extract vector dimension from collection config
        vectors_config = collection_info.config.params.vectors
        if hasattr(vectors_config, 'size'):
            collection_dim = vectors_config.size
        else:
            # Named vectors case
            collection_dim = list(vectors_config.values())[0].size if vectors_config else None
        
        expected_dim = settings.get_embedding_dim()
        is_compatible = collection_dim == expected_dim
        
        return is_compatible, collection_dim, expected_dim, True
        
    except Exception as e:
        print(f"Warning: Could not check Qdrant collection: {e}")
        return True, None, settings.get_embedding_dim(), False


async def recreate_qdrant_collection():
    """Delete and recreate Qdrant collection with correct dimensions."""
    from qdrant_client.models import Distance, VectorParams
    
    try:
        client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )
        
        # Delete existing collection
        client.delete_collection(settings.QDRANT_COLLECTION)
        print(f"Deleted collection '{settings.QDRANT_COLLECTION}'")
        
        # Create new collection with correct dimensions
        expected_dim = settings.get_embedding_dim()
        client.create_collection(
            collection_name=settings.QDRANT_COLLECTION,
            vectors_config=VectorParams(
                size=expected_dim,
                distance=Distance.COSINE,
            ),
        )
        print(f"Created collection '{settings.QDRANT_COLLECTION}' with dimension {expected_dim}")
        return True
        
    except Exception as e:
        print(f"Error recreating collection: {e}")
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown."""
    # Startup
    print("Starting up RAG Backend...")
    print(f"LLM Provider: {settings.LLM_PROVIDER}")
    print(f"Embedding Provider: {settings.EMBEDDING_PROVIDER}")
    
    # Check Qdrant dimension compatibility
    is_compatible, collection_dim, expected_dim, collection_exists = await check_qdrant_dimension_compatibility()
    
    if collection_exists and not is_compatible:
        print(f"\n{'='*60}")
        print(f"WARNING: Embedding dimension mismatch detected!")
        print(f"  Qdrant collection dimension: {collection_dim}")
        print(f"  Expected embedding dimension: {expected_dim}")
        print(f"  Provider: {settings.EMBEDDING_PROVIDER}")
        print(f"{'='*60}")
        print(f"\nAttempting to recreate collection with correct dimensions...")
        print(f"NOTE: This will DELETE all existing vectors in the collection!")
        
        success = await recreate_qdrant_collection()
        if success:
            print("Collection recreated successfully. Please re-upload your documents.")
        else:
            print("ERROR: Failed to recreate collection. Please manually fix the dimension mismatch.")
    elif collection_exists:
        print(f"Qdrant collection '{settings.QDRANT_COLLECTION}' verified (dimension: {collection_dim})")
    else:
        print(f"Qdrant collection '{settings.QDRANT_COLLECTION}' will be created on first use (dimension: {expected_dim})")
    
    yield
    
    # Shutdown
    print("Shutting down RAG Backend...")


# Create FastAPI app with lifespan
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "RAG Backend API",
        "docs": "/docs",
        "version": "0.1.0",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
