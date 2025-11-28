"""Main FastAPI application with Graph RAG support."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown."""
    # Startup
    print("Starting up RAG Backend with Graph RAG support...")
    
    # Initialize job persistence service
    try:
        from app.services.job_persistence import get_job_persistence_service
        job_service = await get_job_persistence_service()
        print("Job persistence service initialized")
        
        # Cleanup old jobs on startup
        deleted = job_service.cleanup_old_jobs()
        if deleted > 0:
            print(f"Cleaned up {deleted} old job records")
    except Exception as e:
        print(f"Warning: Could not initialize job persistence: {e}")
    
    # Initialize graph service (optional)
    try:
        from app.services.graph_service import get_graph_service
        graph_service = await get_graph_service()
        print("Neo4j graph service initialized")
    except Exception as e:
        print(f"Note: Neo4j not available (this is optional): {e}")
    
    # Initialize async processor
    try:
        from app.services.async_processor import get_async_processor
        processor = await get_async_processor()
        print("Async XML processor initialized")
    except Exception as e:
        print(f"Warning: Could not initialize async processor: {e}")
    
    yield
    
    # Shutdown
    print("Shutting down RAG Backend...")
    
    # Close async processor
    try:
        from app.services.async_processor import close_async_processor
        await close_async_processor()
    except Exception:
        pass
    
    # Close graph service
    try:
        from app.services.graph_service import close_graph_service
        await close_graph_service()
    except Exception:
        pass
    
    # Close job persistence
    try:
        from app.services.job_persistence import close_job_persistence_service
        await close_job_persistence_service()
    except Exception:
        pass


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
