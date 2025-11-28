"""XML processing API routes."""
import os
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse

from app.schemas.xml import (
    ProcessingOptionsRequest,
    XMLUploadRequest,
    ResumeJobRequest,
    CancelJobRequest,
    JobResponse,
    JobListResponse,
    ProcessingResultResponse,
    PresetConfigResponse,
    PresetListResponse,
    GraphSettingsRequest,
    GraphSettingsResponse,
)
from app.core.config import settings

router = APIRouter(prefix="/xml", tags=["xml"])


async def get_async_processor():
    """Lazy import and get async processor."""
    from app.services.async_processor import get_async_processor as _get_processor
    return await _get_processor()


async def get_graph_service():
    """Lazy import and get graph service."""
    try:
        from app.services.graph_service import get_graph_service as _get_graph_service
        return await _get_graph_service()
    except Exception:
        return None


@router.get("/presets", response_model=PresetListResponse)
async def get_presets():
    """Get available XML processing presets.
    
    Returns:
        List of available preset configurations
    """
    from app.services.xml_processor import DocBookXMLProcessor
    
    # Create processor to get preset config
    processor = DocBookXMLProcessor()
    preset_config = processor.get_preset_config()
    
    preset = PresetConfigResponse(
        name=preset_config["name"],
        description=preset_config["description"],
        entity_patterns=preset_config["entity_patterns"],
        schicht_mapping=preset_config["schicht_mapping"],
        role_patterns=preset_config["role_patterns"],
        glossary_linking=preset_config["glossary_linking"],
        extract_glossary=preset_config["extract_glossary"],
        track_discontinued=preset_config["track_discontinued"],
        store_bookmark_ids=preset_config["store_bookmark_ids"],
    )
    
    return PresetListResponse(presets=[preset])


@router.post("/process")
async def process_xml_file(request: XMLUploadRequest):
    """Start processing an XML file.
    
    Args:
        request: XML upload request with file path and options
        
    Returns:
        Job ID and initial status
    """
    from app.services.async_processor import ProcessingOptions
    
    # Validate file exists
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")
    
    # Validate file extension
    if not request.file_path.endswith(".xml"):
        raise HTTPException(status_code=400, detail="File must be an XML file")
    
    # Create processing options
    options = ProcessingOptions(
        preset_name=request.options.preset_name,
        chunk_size=request.options.chunk_size,
        chunk_overlap=request.options.chunk_overlap,
        extract_glossary=request.options.extract_glossary,
        track_discontinued=request.options.track_discontinued,
        store_bookmark_ids=request.options.store_bookmark_ids,
        glossary_linking=request.options.glossary_linking,
        create_graph=request.options.create_graph,
        collection_name=request.options.collection_name,
    )
    
    # Start processing
    processor = await get_async_processor()
    job_id = await processor.start_processing(request.file_path, options)
    
    # Get initial job status
    job = await processor.get_job_status(job_id)
    
    return {
        "job_id": job_id,
        "status": job.status.value if job else "pending",
        "message": "Processing started"
    }


@router.post("/upload")
async def upload_and_process_xml(
    file: UploadFile = File(...),
    chunk_size: int = Query(default=512, ge=128, le=2048),
    chunk_overlap: int = Query(default=128, ge=0, le=512),
    extract_glossary: bool = Query(default=True),
    track_discontinued: bool = Query(default=True),
    store_bookmark_ids: bool = Query(default=True),
    create_graph: bool = Query(default=True),
):
    """Upload and process an XML file.
    
    Args:
        file: XML file upload
        chunk_size: Tokens per chunk
        chunk_overlap: Overlap between chunks
        extract_glossary: Extract glossary terms
        track_discontinued: Track discontinued requirements
        store_bookmark_ids: Store bookmark IDs
        create_graph: Create knowledge graph
        
    Returns:
        Job ID and initial status
    """
    from app.services.async_processor import ProcessingOptions
    
    # Validate file extension
    if not file.filename.endswith(".xml"):
        raise HTTPException(status_code=400, detail="File must be an XML file")
    
    # Save uploaded file
    upload_dir = os.path.join(settings.UPLOAD_FOLDER, "xml")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Create processing options
    options = ProcessingOptions(
        preset_name="it-grundschutz",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        extract_glossary=extract_glossary,
        track_discontinued=track_discontinued,
        store_bookmark_ids=store_bookmark_ids,
        glossary_linking="exact_match",
        create_graph=create_graph,
    )
    
    # Start processing
    processor = await get_async_processor()
    job_id = await processor.start_processing(file_path, options)
    
    return {
        "job_id": job_id,
        "filename": file.filename,
        "status": "pending",
        "message": "File uploaded and processing started"
    }


@router.get("/jobs", response_model=JobListResponse)
async def get_all_jobs():
    """Get all processing jobs.
    
    Returns:
        List of all jobs with status
    """
    processor = await get_async_processor()
    jobs = await processor.get_all_jobs()
    resumable = await processor.get_resumable_jobs()
    
    job_responses = []
    for job in jobs:
        # Clamp progress to 0.0-1.0 range (handle legacy/corrupted data)
        progress = min(1.0, max(0.0, job.progress if job.progress <= 1.0 else job.progress / 100.0))
        job_responses.append(JobResponse(
            job_id=job.id,
            filename=job.filename or "",
            file_path=job.file_path or "",
            status=job.status.value if hasattr(job.status, 'value') else str(job.status),
            progress=progress,
            total_chunks=job.total_chunks,
            completed_chunks=job.completed_chunks,
            error_message=job.error_message,
            created_at=job.created_at or "",
            updated_at=job.updated_at or "",
            options=job.options or {},
        ))
    
    return JobListResponse(
        jobs=job_responses,
        total=len(job_responses),
        resumable_count=len(resumable),
    )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str):
    """Get status of a specific job.
    
    Args:
        job_id: The job ID
        
    Returns:
        Job status and progress
    """
    processor = await get_async_processor()
    job = await processor.get_job_status(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    # Clamp progress to 0.0-1.0 range (handle legacy/corrupted data)
    progress = min(1.0, max(0.0, job.progress if job.progress <= 1.0 else job.progress / 100.0))
    return JobResponse(
        job_id=job.id,
        filename=job.filename or "",
        file_path=job.file_path or "",
        status=job.status.value if hasattr(job.status, 'value') else str(job.status),
        progress=progress,
        total_chunks=job.total_chunks,
        completed_chunks=job.completed_chunks,
        error_message=job.error_message,
        created_at=job.created_at or "",
        updated_at=job.updated_at or "",
        options=job.options or {},
    )


@router.get("/jobs/{job_id}/stream")
async def stream_job_progress(job_id: str):
    """Stream job progress as Server-Sent Events.
    
    Args:
        job_id: The job ID
        
    Returns:
        SSE stream of progress updates
    """
    processor = await get_async_processor()
    job = await processor.get_job_status(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    return StreamingResponse(
        processor.stream_progress(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/jobs/{job_id}/resume")
async def resume_job(job_id: str):
    """Resume a failed or interrupted job.
    
    Args:
        job_id: The job ID to resume
        
    Returns:
        Updated job status
    """
    processor = await get_async_processor()
    
    success = await processor.resume_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} cannot be resumed"
        )
    
    job = await processor.get_job_status(job_id)
    return {
        "job_id": job_id,
        "status": job.status.value if job else "running",
        "message": "Job resumed"
    }


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a running job.
    
    Args:
        job_id: The job ID to cancel
        
    Returns:
        Cancellation status
    """
    processor = await get_async_processor()
    
    success = await processor.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} cannot be cancelled (not running)"
        )
    
    return {
        "job_id": job_id,
        "status": "cancelled",
        "message": "Job cancelled"
    }


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job from the database.
    
    Args:
        job_id: The job ID to delete
        
    Returns:
        Deletion status
    """
    processor = await get_async_processor()
    
    # First try to cancel if running
    await processor.cancel_job(job_id)
    
    # Delete from persistence
    success = await processor.delete_job(job_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found"
        )
    
    return {
        "job_id": job_id,
        "status": "deleted",
        "message": "Job deleted"
    }


@router.get("/jobs/resumable")
async def get_resumable_jobs():
    """Get jobs that can be resumed.
    
    Returns:
        List of resumable jobs
    """
    processor = await get_async_processor()
    jobs = await processor.get_resumable_jobs()
    
    return {
        "jobs": [
            {
                "job_id": job.id,
                "filename": job.filename,
                "progress": job.progress,
                "completed_chunks": job.completed_chunks,
                "total_chunks": job.total_chunks,
            }
            for job in jobs
        ],
        "count": len(jobs),
    }


@router.get("/settings", response_model=GraphSettingsResponse)
async def get_graph_settings():
    """Get current graph and processing settings.
    
    Returns:
        Current settings
    """
    graph_service = await get_graph_service()
    neo4j_connected = graph_service is not None
    
    return GraphSettingsResponse(
        neo4j_uri=settings.NEO4J_URI,
        default_depth=settings.GRAPH_DEFAULT_DEPTH,
        max_depth=settings.GRAPH_MAX_DEPTH,
        job_retention_days=settings.JOB_RETENTION_DAYS,
        neo4j_connected=neo4j_connected,
    )


@router.put("/settings")
async def update_settings(request: GraphSettingsRequest):
    """Update graph and processing settings.
    
    Note: Changes are applied at runtime but not persisted to config file.
    
    Args:
        request: New settings values
        
    Returns:
        Updated settings
    """
    # Update settings at runtime
    if request.default_depth is not None:
        settings.GRAPH_DEFAULT_DEPTH = request.default_depth
    if request.max_depth is not None:
        settings.GRAPH_MAX_DEPTH = request.max_depth
    if request.job_retention_days is not None:
        settings.JOB_RETENTION_DAYS = request.job_retention_days
    
    return await get_graph_settings()


@router.delete("/graph/document/{document_id}")
async def delete_document_from_graph(document_id: str):
    """Delete all graph nodes for a document.
    
    Args:
        document_id: The document ID
        
    Returns:
        Deletion result
    """
    graph_service = await get_graph_service()
    if not graph_service:
        raise HTTPException(status_code=503, detail="Graph service not available")
    
    count = await graph_service.delete_document_nodes(document_id)
    
    return {
        "document_id": document_id,
        "deleted_nodes": count,
        "message": f"Deleted {count} nodes from graph"
    }
