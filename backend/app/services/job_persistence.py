"""SQLite-based job persistence service for resumable async processing."""
import sqlite3
import json
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
from pathlib import Path
import asyncio
from contextlib import contextmanager
from dataclasses import dataclass, field

from app.core.config import settings


class JobStatus(str, Enum):
    """Job status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RESUMABLE = "resumable"


class JobType(str, Enum):
    """Job type enumeration."""
    XML_INGESTION = "xml_ingestion"
    GRAPH_CREATION = "graph_creation"
    EMBEDDING_GENERATION = "embedding_generation"


@dataclass
class JobRecord:
    """Job record data class."""
    id: str
    job_type: str
    status: JobStatus
    document_id: Optional[str] = None
    filename: Optional[str] = None
    file_path: Optional[str] = None
    total_chunks: int = 0
    completed_chunks: int = 0
    failed_chunks: int = 0
    progress: float = 0.0
    error_message: Optional[str] = None
    options: Optional[Dict[str, Any]] = None
    completed_chunk_ids: List[str] = field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class JobPersistenceService:
    """Service for persisting and managing async job state in SQLite."""
    
    def __init__(self, db_path: Optional[str] = None):
        """Initialize the job persistence service.
        
        Args:
            db_path: Path to SQLite database file. Uses settings default if not provided.
        """
        self.db_path = db_path or settings.JOB_DB_PATH
        self._ensure_db_exists()
    
    def _ensure_db_exists(self) -> None:
        """Ensure database and tables exist."""
        db_dir = Path(self.db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)
        
        with self._get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    job_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    document_id TEXT,
                    filename TEXT,
                    file_path TEXT,
                    total_chunks INTEGER DEFAULT 0,
                    completed_chunks INTEGER DEFAULT 0,
                    failed_chunks INTEGER DEFAULT 0,
                    progress_percent REAL DEFAULT 0.0,
                    error_message TEXT,
                    config_json TEXT,
                    completed_chunk_ids_json TEXT DEFAULT '[]',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS job_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    chunk_id TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    error_message TEXT,
                    processed_at TIMESTAMP,
                    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
                    UNIQUE(job_id, chunk_index)
                );
                
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
                CREATE INDEX IF NOT EXISTS idx_job_chunks_job_id ON job_chunks(job_id);
                CREATE INDEX IF NOT EXISTS idx_job_chunks_status ON job_chunks(status);
            """)
    
    @contextmanager
    def _get_connection(self):
        """Get a database connection with row factory."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    def _row_to_job_record(self, row: sqlite3.Row) -> JobRecord:
        """Convert a database row to JobRecord."""
        row_dict = dict(row)
        return JobRecord(
            id=row_dict['id'],
            job_type=row_dict['job_type'],
            status=JobStatus(row_dict['status']),
            document_id=row_dict.get('document_id'),
            filename=row_dict.get('filename'),
            file_path=row_dict.get('file_path'),
            total_chunks=row_dict.get('total_chunks', 0),
            completed_chunks=row_dict.get('completed_chunks', 0),
            failed_chunks=row_dict.get('failed_chunks', 0),
            progress=row_dict.get('progress_percent', 0.0),
            error_message=row_dict.get('error_message'),
            options=json.loads(row_dict['config_json']) if row_dict.get('config_json') else None,
            completed_chunk_ids=json.loads(row_dict['completed_chunk_ids_json']) if row_dict.get('completed_chunk_ids_json') else [],
            created_at=row_dict.get('created_at'),
            updated_at=row_dict.get('updated_at'),
            started_at=row_dict.get('started_at'),
            completed_at=row_dict.get('completed_at')
        )
    
    async def create_job(
        self,
        job_type: JobType,
        filename: str,
        file_path: str,
        document_id: Optional[str] = None,
        total_chunks: int = 0,
        options: Optional[Dict[str, Any]] = None
    ) -> JobRecord:
        """Create a new job record.
        
        Args:
            job_type: Type of job (XML ingestion, graph creation, etc.)
            filename: Original filename
            file_path: Path to the file
            document_id: Associated document ID
            total_chunks: Total number of chunks to process
            options: Job configuration dictionary
            
        Returns:
            Created JobRecord
        """
        job_id = str(uuid.uuid4())
        config_json = json.dumps(options) if options else None
        now = datetime.utcnow().isoformat()
        
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO jobs (id, job_type, document_id, filename, file_path, total_chunks, config_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (job_id, job_type.value, document_id, filename, file_path, total_chunks, config_json, now, now))
        
        return JobRecord(
            id=job_id,
            job_type=job_type.value,
            status=JobStatus.PENDING,
            document_id=document_id,
            filename=filename,
            file_path=file_path,
            total_chunks=total_chunks,
            options=options,
            created_at=now,
            updated_at=now
        )
    
    async def get_job(self, job_id: str) -> Optional[JobRecord]:
        """Get job details by ID.
        
        Args:
            job_id: Job ID
            
        Returns:
            JobRecord or None if not found
        """
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
            
            if row:
                return self._row_to_job_record(row)
        return None
    
    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        error_message: Optional[str] = None
    ) -> None:
        """Update job status.
        
        Args:
            job_id: Job ID
            status: New status
            error_message: Optional error message for failed jobs
        """
        now = datetime.utcnow().isoformat()
        
        with self._get_connection() as conn:
            if status == JobStatus.RUNNING:
                conn.execute("""
                    UPDATE jobs 
                    SET status = ?, started_at = ?, updated_at = ?
                    WHERE id = ?
                """, (status.value, now, now, job_id))
            elif status in (JobStatus.COMPLETED, JobStatus.FAILED):
                conn.execute("""
                    UPDATE jobs 
                    SET status = ?, error_message = ?, completed_at = ?, updated_at = ?
                    WHERE id = ?
                """, (status.value, error_message, now, now, job_id))
            else:
                conn.execute("""
                    UPDATE jobs 
                    SET status = ?, error_message = ?, updated_at = ?
                    WHERE id = ?
                """, (status.value, error_message, now, job_id))
    
    async def update_job_progress(
        self,
        job_id: str,
        status: Optional[JobStatus] = None,
        progress: Optional[float] = None,
        total_chunks: Optional[int] = None,
        completed_chunks: Optional[int] = None,
        failed_chunks: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> None:
        """Update job progress.
        
        Args:
            job_id: Job ID
            status: Optional new status
            progress: Optional progress value (0.0-1.0)
            total_chunks: Optional total chunks count
            completed_chunks: Number of completed chunks
            failed_chunks: Number of failed chunks
            error_message: Optional error message
        """
        now = datetime.utcnow().isoformat()
        
        with self._get_connection() as conn:
            updates = ["updated_at = ?"]
            params: List[Any] = [now]
            
            if status is not None:
                updates.append("status = ?")
                params.append(status.value)
                if status == JobStatus.RUNNING:
                    updates.append("started_at = COALESCE(started_at, ?)")
                    params.append(now)
                elif status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                    updates.append("completed_at = ?")
                    params.append(now)
            
            if progress is not None:
                updates.append("progress_percent = ?")
                params.append(progress * 100)  # Store as percentage
            
            if total_chunks is not None:
                updates.append("total_chunks = ?")
                params.append(total_chunks)
            
            if completed_chunks is not None:
                updates.append("completed_chunks = ?")
                params.append(completed_chunks)
            
            if failed_chunks is not None:
                updates.append("failed_chunks = ?")
                params.append(failed_chunks)
            
            if error_message is not None:
                updates.append("error_message = ?")
                params.append(error_message)
            
            params.append(job_id)
            
            conn.execute(f"""
                UPDATE jobs SET {', '.join(updates)} WHERE id = ?
            """, params)
    
    async def mark_chunk_completed(self, job_id: str, chunk_id: str) -> None:
        """Mark a chunk as completed and update the completed_chunk_ids list.
        
        Args:
            job_id: Job ID
            chunk_id: The chunk ID that was completed
        """
        with self._get_connection() as conn:
            # Get current completed chunk IDs
            row = conn.execute(
                "SELECT completed_chunk_ids_json FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
            
            if row:
                current_ids = json.loads(row['completed_chunk_ids_json']) if row['completed_chunk_ids_json'] else []
                if chunk_id not in current_ids:
                    current_ids.append(chunk_id)
                    conn.execute("""
                        UPDATE jobs SET completed_chunk_ids_json = ?, updated_at = ?
                        WHERE id = ?
                    """, (json.dumps(current_ids), datetime.utcnow().isoformat(), job_id))
    
    async def get_all_jobs(self, limit: int = 100) -> List[JobRecord]:
        """Get all job records.
        
        Args:
            limit: Maximum number of jobs to return
            
        Returns:
            List of JobRecord objects
        """
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [self._row_to_job_record(row) for row in rows]
    
    async def get_resumable_jobs(self) -> List[JobRecord]:
        """Get jobs that can be resumed (were running when backend stopped).
        
        Returns:
            List of resumable JobRecord objects
        """
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE status = ?", (JobStatus.RESUMABLE.value,)
            ).fetchall()
            return [self._row_to_job_record(row) for row in rows]
    
    def set_total_chunks(self, job_id: str, total_chunks: int) -> None:
        """Set the total number of chunks for a job.
        
        Args:
            job_id: Job ID
            total_chunks: Total number of chunks
        """
        now = datetime.utcnow().isoformat()
        
        with self._get_connection() as conn:
            conn.execute("""
                UPDATE jobs SET total_chunks = ?, updated_at = ? WHERE id = ?
            """, (total_chunks, now, job_id))
    
    def record_chunk_completion(
        self,
        job_id: str,
        chunk_index: int,
        chunk_id: Optional[str] = None,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> None:
        """Record completion of a single chunk.
        
        Args:
            job_id: Job ID
            chunk_index: Index of the chunk
            chunk_id: Generated chunk ID (for Qdrant)
            success: Whether processing succeeded
            error_message: Error message if failed
        """
        now = datetime.utcnow().isoformat()
        status = "completed" if success else "failed"
        
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO job_chunks 
                (job_id, chunk_index, chunk_id, status, error_message, processed_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (job_id, chunk_index, chunk_id, status, error_message, now))
    
    def get_pending_chunk_indices(self, job_id: str) -> List[int]:
        """Get indices of chunks that haven't been processed yet.
        
        Args:
            job_id: Job ID
            
        Returns:
            List of pending chunk indices
        """
        with self._get_connection() as conn:
            # Get total chunks
            job = conn.execute(
                "SELECT total_chunks FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
            
            if not job:
                return []
            
            total_chunks = job['total_chunks']
            
            # Get completed/failed chunk indices
            processed = conn.execute("""
                SELECT chunk_index FROM job_chunks 
                WHERE job_id = ? AND status IN ('completed', 'failed')
            """, (job_id,)).fetchall()
            
            processed_indices = {row['chunk_index'] for row in processed}
            
            # Return indices that haven't been processed
            return [i for i in range(total_chunks) if i not in processed_indices]
    
    def get_completed_chunk_ids(self, job_id: str) -> List[str]:
        """Get IDs of successfully completed chunks.
        
        Args:
            job_id: Job ID
            
        Returns:
            List of chunk IDs
        """
        with self._get_connection() as conn:
            rows = conn.execute("""
                SELECT chunk_id FROM job_chunks 
                WHERE job_id = ? AND status = 'completed' AND chunk_id IS NOT NULL
            """, (job_id,)).fetchall()
            
            return [row['chunk_id'] for row in rows]
    
    def list_jobs(
        self,
        status: Optional[JobStatus] = None,
        job_type: Optional[JobType] = None,
        limit: int = 50
    ) -> List[JobRecord]:
        """List jobs with optional filtering.
        
        Args:
            status: Filter by status
            job_type: Filter by job type
            limit: Maximum number of results
            
        Returns:
            List of job records
        """
        query = "SELECT * FROM jobs WHERE 1=1"
        params: List[Any] = []
        
        if status:
            query += " AND status = ?"
            params.append(status.value)
        
        if job_type:
            query += " AND job_type = ?"
            params.append(job_type.value)
        
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_job_record(row) for row in rows]
    
    def mark_interrupted_jobs_resumable(self) -> int:
        """Mark jobs that were running as resumable (called on startup).
        
        Returns:
            Number of jobs marked as resumable
        """
        now = datetime.utcnow().isoformat()
        
        with self._get_connection() as conn:
            cursor = conn.execute("""
                UPDATE jobs 
                SET status = ?, updated_at = ?
                WHERE status = ?
            """, (JobStatus.RESUMABLE.value, now, JobStatus.RUNNING.value))
            
            return cursor.rowcount
    
    def cleanup_old_jobs(self, retention_days: Optional[int] = None) -> int:
        """Delete job records older than retention period.
        
        Args:
            retention_days: Days to retain records. Uses settings default if not provided.
            
        Returns:
            Number of jobs deleted
        """
        days = retention_days or settings.JOB_RETENTION_DAYS
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        with self._get_connection() as conn:
            # Delete old completed/failed jobs
            cursor = conn.execute("""
                DELETE FROM jobs 
                WHERE status IN (?, ?) AND created_at < ?
            """, (JobStatus.COMPLETED.value, JobStatus.FAILED.value, cutoff.isoformat()))
            
            return cursor.rowcount
    
    async def delete_job(self, job_id: str) -> bool:
        """Delete a job and its chunk records.
        
        Args:
            job_id: Job ID
            
        Returns:
            True if job was deleted
        """
        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
            return cursor.rowcount > 0


# Global instance
_job_persistence: Optional[JobPersistenceService] = None


def get_job_persistence() -> JobPersistenceService:
    """Get the global job persistence service instance."""
    global _job_persistence
    if _job_persistence is None:
        _job_persistence = JobPersistenceService()
    return _job_persistence


async def get_job_persistence_service() -> JobPersistenceService:
    """Get the job persistence service instance (async version for compatibility)."""
    return get_job_persistence()


async def close_job_persistence_service() -> None:
    """Close job persistence service (no-op for SQLite, kept for consistency)."""
    global _job_persistence
    _job_persistence = None


async def initialize_job_persistence() -> None:
    """Initialize job persistence on application startup."""
    service = get_job_persistence()
    
    # Mark any jobs that were running as resumable
    count = service.mark_interrupted_jobs_resumable()
    if count > 0:
        print(f"Marked {count} interrupted jobs as resumable")
    
    # Cleanup old job records
    deleted = service.cleanup_old_jobs()
    if deleted > 0:
        print(f"Cleaned up {deleted} old job records")
