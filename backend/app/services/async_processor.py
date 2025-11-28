"""Async processor for XML document ingestion with progress tracking.

Handles background processing of XML documents with:
- ThreadPoolExecutor for parallel processing
- SSE progress streaming
- Job persistence for resume capability
- Graceful cancellation
"""
import asyncio
import json
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from datetime import datetime
from typing import Optional, Dict, Any, List, AsyncGenerator, Callable
from dataclasses import dataclass, field
from enum import Enum
import os

from app.core.config import settings
from app.services.xml_processor import DocBookXMLProcessor, XMLProcessingResult
from app.services.graph_service import GraphService, get_graph_service
from app.services.job_persistence import (
    JobPersistenceService, 
    JobStatus,
    JobType,
    JobRecord,
    get_job_persistence_service
)


class ProcessingStage(str, Enum):
    """Stages of XML processing."""
    PARSING = "parsing"
    EXTRACTING = "extracting"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    STORING_VECTORS = "storing_vectors"
    CREATING_GRAPH = "creating_graph"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ProgressUpdate:
    """Progress update for SSE streaming."""
    job_id: str
    stage: ProcessingStage
    progress: float  # 0.0 to 1.0
    message: str
    current_item: Optional[str] = None
    items_completed: int = 0
    items_total: int = 0
    error: Optional[str] = None
    
    def to_sse(self) -> str:
        """Format as Server-Sent Event."""
        data = {
            "job_id": self.job_id,
            "stage": self.stage.value,
            "progress": self.progress,
            "message": self.message,
            "current_item": self.current_item,
            "items_completed": self.items_completed,
            "items_total": self.items_total,
            "error": self.error,
            "timestamp": datetime.now().isoformat()
        }
        return f"data: {json.dumps(data)}\n\n"


@dataclass
class ProcessingOptions:
    """Options for XML processing."""
    preset_name: str = "it-grundschutz"
    chunk_size: int = 512
    chunk_overlap: int = 128
    extract_glossary: bool = True
    track_discontinued: bool = True
    store_bookmark_ids: bool = True
    glossary_linking: str = "exact_match"
    create_graph: bool = True
    collection_name: Optional[str] = None


class AsyncXMLProcessor:
    """Async processor for XML document ingestion.
    
    Manages background processing jobs with:
    - Progress tracking and SSE streaming
    - Resume capability for interrupted jobs
    - Parallel chunk processing
    - Graph creation integration
    """
    
    MAX_WORKERS = 10  # As specified in requirements
    
    def __init__(self):
        """Initialize the async processor."""
        self._executor = ThreadPoolExecutor(max_workers=self.MAX_WORKERS)
        self._active_jobs: Dict[str, Any] = {}  # Can be Task or Future
        self._progress_callbacks: Dict[str, List[Callable[[ProgressUpdate], Any]]] = {}
        self._cancelled_jobs: set = set()
        self._job_persistence: Optional[JobPersistenceService] = None
        self._graph_service: Optional[GraphService] = None
    
    async def initialize(self) -> None:
        """Initialize services."""
        self._job_persistence = await get_job_persistence_service()
        try:
            self._graph_service = await get_graph_service()
        except Exception as e:
            print(f"Warning: Could not connect to Neo4j: {e}")
            self._graph_service = None
    
    async def close(self) -> None:
        """Shutdown the processor and cleanup."""
        self._executor.shutdown(wait=False)
        self._active_jobs.clear()
    
    async def start_processing(
        self,
        file_path: str,
        options: ProcessingOptions
    ) -> str:
        """Start processing an XML file.
        
        Args:
            file_path: Path to the XML file
            options: Processing options
            
        Returns:
            Job ID for tracking
        """
        print(f"[AsyncXMLProcessor] start_processing called for: {file_path}")
        
        if self._job_persistence is None:
            print("[AsyncXMLProcessor] ERROR: Job persistence service not initialized")
            raise RuntimeError("Job persistence service not initialized")
        
        # Get file info
        filename = os.path.basename(file_path)
        print(f"[AsyncXMLProcessor] Creating job for file: {filename}")
        
        # Create job record
        job = await self._job_persistence.create_job(
            job_type=JobType.XML_INGESTION,
            filename=filename,
            file_path=file_path,
            total_chunks=0,  # Will be updated during processing
            options=options.__dict__
        )
        job_id = job.id
        print(f"[AsyncXMLProcessor] Created job with ID: {job_id}")
        
        # Start processing in background as async task (not in thread pool)
        # This keeps everything in the same event loop
        print(f"[AsyncXMLProcessor] Creating async task for job: {job_id}")
        
        async def wrapped_process():
            """Wrapper to catch and log all exceptions."""
            try:
                print(f"[AsyncXMLProcessor] Task started for job: {job_id}")
                result = await self._process_async(job_id, file_path, options)
                print(f"[AsyncXMLProcessor] Task completed for job: {job_id}")
                return result
            except Exception as e:
                import traceback
                print(f"[AsyncXMLProcessor] Task failed for job {job_id}: {e}")
                print(f"[AsyncXMLProcessor] Traceback:\n{traceback.format_exc()}")
                raise
        
        task = asyncio.create_task(wrapped_process())
        print(f"[AsyncXMLProcessor] Task created: {task}")
        
        self._active_jobs[job_id] = task
        
        # Handle completion
        task.add_done_callback(lambda t: asyncio.create_task(self._handle_completion_task(job_id, t)))
        
        print(f"[AsyncXMLProcessor] Returning job_id: {job_id}")
        return job_id
    
    async def _handle_completion_task(self, job_id: str, task: asyncio.Task) -> None:
        """Handle async task completion."""
        self._active_jobs.pop(job_id, None)
        
        if self._job_persistence is None:
            return
        
        try:
            result = task.result()
            if result:
                await self._job_persistence.update_job_progress(
                    job_id=job_id,
                    status=JobStatus.COMPLETED,
                    progress=1.0
                )
        except asyncio.CancelledError:
            await self._job_persistence.update_job_progress(
                job_id=job_id,
                status=JobStatus.CANCELLED,
                error_message="Job was cancelled"
            )
        except Exception as e:
            await self._job_persistence.update_job_progress(
                job_id=job_id,
                status=JobStatus.FAILED,
                error_message=str(e)
            )

    async def _handle_completion(self, job_id: str, future: Future[Any]) -> None:
        """Handle job completion."""
        self._active_jobs.pop(job_id, None)
        
        if self._job_persistence is None:
            return
        
        try:
            result = future.result()
            if result:
                await self._job_persistence.update_job_progress(
                    job_id=job_id,
                    status=JobStatus.COMPLETED,
                    progress=1.0
                )
        except Exception as e:
            await self._job_persistence.update_job_progress(
                job_id=job_id,
                status=JobStatus.FAILED,
                error_message=str(e)
            )
    
    async def _process_async(
        self,
        job_id: str,
        file_path: str,
        options: ProcessingOptions
    ) -> Optional[XMLProcessingResult]:
        """Async processing function that stays in the main event loop.
        
        This is the main processing pipeline.
        """
        try:
            # Check if cancelled
            if job_id in self._cancelled_jobs:
                return None
            
            print(f"[XML Processing] Starting job {job_id} for file: {file_path}")
            
            # Update status to running
            await self._update_progress(
                job_id, ProcessingStage.PARSING, 0.05,
                "Starting XML parsing..."
            )
            
            print(f"[XML Processing] Parsing XML file...")
            
            # Run CPU-bound XML parsing in thread pool
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                self._executor,
                self._parse_xml_sync,
                file_path,
                options
            )
            
            print(f"[XML Processing] Parsed: {len(result.entities)} entities, {len(result.chunks)} chunks")
            
            if job_id in self._cancelled_jobs:
                return None
            
            # Update total chunks
            if self._job_persistence:
                await self._job_persistence.update_job_progress(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    total_chunks=len(result.chunks)
                )
            
            await self._update_progress(
                job_id, ProcessingStage.CHUNKING, 0.3,
                f"Extracted {len(result.entities)} entities, {len(result.chunks)} chunks"
            )
            
            # Store in vector database
            await self._update_progress(
                job_id, ProcessingStage.EMBEDDING, 0.4,
                "Generating embeddings..."
            )
            
            # Process chunks in batches
            await self._store_chunks(job_id, result, options)
            
            if job_id in self._cancelled_jobs:
                return None
            
            # Create graph if enabled
            if options.create_graph and self._graph_service:
                await self._update_progress(
                    job_id, ProcessingStage.CREATING_GRAPH, 0.8,
                    "Creating knowledge graph..."
                )
                
                await self._create_graph(job_id, result)
            
            await self._update_progress(
                job_id, ProcessingStage.COMPLETED, 1.0,
                "Processing completed successfully"
            )
            
            return result
            
        except Exception as e:
            await self._update_progress(
                job_id, ProcessingStage.FAILED, 0.0,
                f"Processing failed: {str(e)}",
                error=str(e)
            )
            raise

    def _parse_xml_sync(
        self,
        file_path: str,
        options: ProcessingOptions
    ) -> XMLProcessingResult:
        """Synchronous XML parsing (runs in thread pool)."""
        processor = DocBookXMLProcessor(
            chunk_size=options.chunk_size,
            chunk_overlap=options.chunk_overlap,
            extract_glossary=options.extract_glossary,
            track_discontinued=options.track_discontinued,
            store_bookmark_ids=options.store_bookmark_ids,
            glossary_linking=options.glossary_linking
        )
        return processor.process_file(file_path)

    def _process_sync(
        self,
        job_id: str,
        file_path: str,
        options: ProcessingOptions
    ) -> Optional[XMLProcessingResult]:
        """Synchronous processing function (runs in thread pool).
        
        This is the main processing pipeline.
        """
        try:
            # Check if cancelled
            if job_id in self._cancelled_jobs:
                return None
            
            # Update status to running
            asyncio.run(self._update_progress(
                job_id, ProcessingStage.PARSING, 0.0,
                "Starting XML parsing..."
            ))
            
            # Create XML processor
            processor = DocBookXMLProcessor(
                chunk_size=options.chunk_size,
                chunk_overlap=options.chunk_overlap,
                extract_glossary=options.extract_glossary,
                track_discontinued=options.track_discontinued,
                store_bookmark_ids=options.store_bookmark_ids,
                glossary_linking=options.glossary_linking
            )
            
            # Parse and extract
            asyncio.run(self._update_progress(
                job_id, ProcessingStage.EXTRACTING, 0.1,
                "Extracting entities and relationships..."
            ))
            
            result = processor.process_file(file_path)
            
            if job_id in self._cancelled_jobs:
                return None
            
            # Update total chunks
            asyncio.run(self._job_persistence.update_job_progress(
                job_id=job_id,
                status=JobStatus.RUNNING,
                total_chunks=len(result.chunks)
            ))
            
            asyncio.run(self._update_progress(
                job_id, ProcessingStage.CHUNKING, 0.3,
                f"Extracted {len(result.entities)} entities, {len(result.chunks)} chunks"
            ))
            
            # Store in vector database
            asyncio.run(self._update_progress(
                job_id, ProcessingStage.EMBEDDING, 0.4,
                "Generating embeddings..."
            ))
            
            # Process chunks in batches
            asyncio.run(self._store_chunks(
                job_id, result, options
            ))
            
            if job_id in self._cancelled_jobs:
                return None
            
            # Create graph if enabled
            if options.create_graph and self._graph_service:
                asyncio.run(self._update_progress(
                    job_id, ProcessingStage.CREATING_GRAPH, 0.8,
                    "Creating knowledge graph..."
                ))
                
                asyncio.run(self._create_graph(
                    job_id, result
                ))
            
            asyncio.run(self._update_progress(
                job_id, ProcessingStage.COMPLETED, 1.0,
                "Processing completed successfully"
            ))
            
            return result
            
        except Exception as e:
            asyncio.run(self._update_progress(
                job_id, ProcessingStage.FAILED, 0.0,
                f"Processing failed: {str(e)}",
                error=str(e)
            ))
            raise
    
    async def _update_progress(
        self,
        job_id: str,
        stage: ProcessingStage,
        progress: float,
        message: str,
        current_item: Optional[str] = None,
        items_completed: int = 0,
        items_total: int = 0,
        error: Optional[str] = None
    ) -> None:
        """Update progress and notify listeners."""
        update = ProgressUpdate(
            job_id=job_id,
            stage=stage,
            progress=progress,
            message=message,
            current_item=current_item,
            items_completed=items_completed,
            items_total=items_total,
            error=error
        )
        
        # Update job persistence
        status = JobStatus.RUNNING
        if stage == ProcessingStage.COMPLETED:
            status = JobStatus.COMPLETED
        elif stage == ProcessingStage.FAILED:
            status = JobStatus.FAILED
        elif stage == ProcessingStage.CANCELLED:
            status = JobStatus.CANCELLED
        
        await self._job_persistence.update_job_progress(
            job_id=job_id,
            status=status,
            progress=progress,
            error_message=error
        )
        
        # Notify callbacks
        for callback in self._progress_callbacks.get(job_id, []):
            try:
                await callback(update)
            except Exception:
                pass
    
    async def _store_chunks(
        self,
        job_id: str,
        result: XMLProcessingResult,
        options: ProcessingOptions
    ) -> None:
        """Store chunks in vector database with progress tracking."""
        from app.services.qdrant_service import QdrantService
        from app.services.embedding_service import EmbeddingService
        
        qdrant_service = QdrantService()
        embedding_service = EmbeddingService()
        
        collection_name = options.collection_name or "documents"
        
        total_chunks = len(result.chunks)
        
        # Get already completed chunks (for resume)
        job = await self._job_persistence.get_job(job_id)
        completed_chunk_ids = set(job.completed_chunk_ids) if job else set()
        
        batch_size = 32
        chunks_to_process = [c for c in result.chunks if c.id not in completed_chunk_ids]
        
        for i in range(0, len(chunks_to_process), batch_size):
            if job_id in self._cancelled_jobs:
                return
            
            batch = chunks_to_process[i:i + batch_size]
            
            # Generate embeddings
            texts = [c.content for c in batch]
            embeddings = embedding_service.embed_texts(texts)
            
            # Prepare points for Qdrant
            points = []
            for j, chunk in enumerate(batch):
                metadata = {
                    "document_id": result.document_id,
                    "filename": result.filename,
                    "entity_id": chunk.entity_id,
                    "entity_type": chunk.entity_type.value,
                    "chunk_index": chunk.chunk_index,
                    "total_chunks": chunk.total_chunks,
                    "content": chunk.content,
                    **chunk.metadata
                }
                
                if chunk.bookmark_id:
                    metadata["bookmark_id"] = chunk.bookmark_id
                
                if chunk.glossary_term_ids:
                    metadata["glossary_term_ids"] = chunk.glossary_term_ids
                
                points.append({
                    "id": chunk.id,
                    "vector": embeddings[j],
                    "payload": metadata
                })
            
            # Store in Qdrant
            await qdrant_service.upsert_points(collection_name, points)
            
            # Mark chunks as completed
            for chunk in batch:
                await self._job_persistence.mark_chunk_completed(job_id, chunk.id)
            
            progress = 0.4 + (0.4 * (i + len(batch)) / total_chunks)
            await self._update_progress(
                job_id, ProcessingStage.STORING_VECTORS, progress,
                f"Stored {min(i + len(batch), total_chunks)}/{total_chunks} chunks",
                items_completed=min(i + len(batch), total_chunks),
                items_total=total_chunks
            )
    
    async def _create_graph(
        self,
        job_id: str,
        result: XMLProcessingResult
    ) -> None:
        """Create knowledge graph from extracted entities."""
        if not self._graph_service:
            return
        
        total_entities = len(result.entities)
        total_rels = len(result.relationships)
        
        # Create nodes
        for i, entity in enumerate(result.entities):
            if job_id in self._cancelled_jobs:
                return
            
            await self._graph_service.create_node(entity, result.document_id)
            
            if i % 50 == 0:
                progress = 0.8 + (0.1 * i / total_entities)
                await self._update_progress(
                    job_id, ProcessingStage.CREATING_GRAPH, progress,
                    f"Created {i}/{total_entities} graph nodes",
                    items_completed=i,
                    items_total=total_entities
                )
        
        # Create relationships
        for i, rel in enumerate(result.relationships):
            if job_id in self._cancelled_jobs:
                return
            
            await self._graph_service.create_relationship(rel)
            
            if i % 100 == 0:
                progress = 0.9 + (0.1 * i / total_rels) if total_rels > 0 else 0.95
                await self._update_progress(
                    job_id, ProcessingStage.CREATING_GRAPH, progress,
                    f"Created {i}/{total_rels} relationships",
                    items_completed=i,
                    items_total=total_rels
                )
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a running job.
        
        Args:
            job_id: The job ID to cancel
            
        Returns:
            True if cancelled, False if not found
        """
        if job_id in self._active_jobs:
            self._cancelled_jobs.add(job_id)
            
            await self._job_persistence.update_job_progress(
                job_id=job_id,
                status=JobStatus.CANCELLED
            )
            
            return True
        return False
    
    async def get_job_status(self, job_id: str) -> Optional[JobRecord]:
        """Get the current status of a job.
        
        Args:
            job_id: The job ID
            
        Returns:
            JobRecord if found
        """
        return await self._job_persistence.get_job(job_id)
    
    async def get_all_jobs(self) -> List[JobRecord]:
        """Get all job records."""
        return await self._job_persistence.get_all_jobs()
    
    async def get_resumable_jobs(self) -> List[JobRecord]:
        """Get jobs that can be resumed."""
        return await self._job_persistence.get_resumable_jobs()
    
    async def delete_job(self, job_id: str) -> bool:
        """Delete a job from the database.
        
        Args:
            job_id: The job ID to delete
            
        Returns:
            True if deleted, False if not found
        """
        if self._job_persistence is None:
            return False
        return await self._job_persistence.delete_job(job_id)
    
    async def resume_job(self, job_id: str) -> bool:
        """Resume a previously interrupted job.
        
        Args:
            job_id: The job ID to resume
            
        Returns:
            True if resumed, False if not resumable
        """
        job = await self._job_persistence.get_job(job_id)
        if not job:
            return False
        
        if job.status not in [JobStatus.RUNNING, JobStatus.FAILED]:
            return False
        
        # Remove from cancelled set if present
        self._cancelled_jobs.discard(job_id)
        
        # Get options from job
        options = ProcessingOptions(**job.options) if job.options else ProcessingOptions()
        
        # Update status
        await self._job_persistence.update_job_progress(
            job_id=job_id,
            status=JobStatus.RUNNING
        )
        
        # Start processing again (will skip already completed chunks)
        future = asyncio.get_event_loop().run_in_executor(
            self._executor,
            self._process_sync,
            job_id,
            job.file_path,
            options
        )
        
        self._active_jobs[job_id] = future
        future.add_done_callback(
            lambda f: asyncio.create_task(self._handle_completion(job_id, f))
        )
        
        return True
    
    async def stream_progress(self, job_id: str) -> AsyncGenerator[str, None]:
        """Stream progress updates as Server-Sent Events.
        
        Args:
            job_id: The job ID to stream
            
        Yields:
            SSE formatted progress updates
        """
        queue: asyncio.Queue = asyncio.Queue()
        
        async def callback(update: ProgressUpdate):
            await queue.put(update)
        
        # Register callback
        if job_id not in self._progress_callbacks:
            self._progress_callbacks[job_id] = []
        self._progress_callbacks[job_id].append(callback)
        
        try:
            # Send initial status
            job = await self._job_persistence.get_job(job_id)
            if job:
                # Map JobStatus to ProcessingStage
                stage_map = {
                    JobStatus.PENDING: ProcessingStage.PARSING,
                    JobStatus.RUNNING: ProcessingStage.EXTRACTING,  # Default for running
                    JobStatus.COMPLETED: ProcessingStage.COMPLETED,
                    JobStatus.FAILED: ProcessingStage.FAILED,
                    JobStatus.CANCELLED: ProcessingStage.CANCELLED,
                }
                stage = stage_map.get(job.status, ProcessingStage.PARSING)
                initial = ProgressUpdate(
                    job_id=job_id,
                    stage=stage,
                    progress=job.progress,
                    message=f"Current status: {job.status.value}",
                    error=job.error_message
                )
                yield initial.to_sse()
            
            # Stream updates
            while True:
                try:
                    update = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield update.to_sse()
                    
                    # Check if job is complete
                    if update.stage in [ProcessingStage.COMPLETED, ProcessingStage.FAILED, ProcessingStage.CANCELLED]:
                        break
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": keepalive\n\n"
                    
                    # Check if job still exists
                    job = await self._job_persistence.get_job(job_id)
                    if not job or job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                        break
        finally:
            # Cleanup callback
            if job_id in self._progress_callbacks:
                self._progress_callbacks[job_id].remove(callback)
                if not self._progress_callbacks[job_id]:
                    del self._progress_callbacks[job_id]


# Singleton instance
_async_processor: Optional[AsyncXMLProcessor] = None


async def get_async_processor() -> AsyncXMLProcessor:
    """Get or create the async processor singleton."""
    global _async_processor
    if _async_processor is None:
        _async_processor = AsyncXMLProcessor()
        await _async_processor.initialize()
    return _async_processor


async def close_async_processor() -> None:
    """Close the async processor."""
    global _async_processor
    if _async_processor:
        await _async_processor.close()
        _async_processor = None
