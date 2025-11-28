"""Pydantic schemas for XML processing API."""
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    """Status of an XML processing job."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProcessingStage(str, Enum):
    """Current processing stage."""
    PARSING = "parsing"
    EXTRACTING = "extracting"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    STORING_VECTORS = "storing_vectors"
    CREATING_GRAPH = "creating_graph"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EntityType(str, Enum):
    """Types of entities extracted from IT-Grundschutz documents."""
    SCHICHT = "schicht"
    BAUSTEIN = "baustein"
    GEFAEHRDUNG = "gefaehrdung"
    ANFORDERUNG = "anforderung"
    ROLLE = "rolle"
    GLOSSARY_TERM = "glossary_term"
    STANDARD = "standard"


class AnforderungTyp(str, Enum):
    """Requirement types in IT-Grundschutz."""
    BASIS = "B"
    STANDARD = "S"
    HOCH = "H"


class GraphRAGStrategy(str, Enum):
    """Graph RAG retrieval strategies."""
    NONE = "none"
    MERGE = "merge"
    PRE_FILTER = "pre_filter"
    POST_ENRICH = "post_enrich"


# Request schemas

class ProcessingOptionsRequest(BaseModel):
    """Options for XML processing."""
    preset_name: str = Field(default="it-grundschutz", description="Processing preset name")
    chunk_size: int = Field(default=512, ge=128, le=2048, description="Tokens per chunk")
    chunk_overlap: int = Field(default=128, ge=0, le=512, description="Overlap between chunks")
    extract_glossary: bool = Field(default=True, description="Extract glossary terms")
    track_discontinued: bool = Field(default=True, description="Track discontinued requirements")
    store_bookmark_ids: bool = Field(default=True, description="Store bookmark IDs for deep linking")
    glossary_linking: str = Field(default="exact_match", description="Glossary linking strategy")
    create_graph: bool = Field(default=True, description="Create knowledge graph")
    collection_name: Optional[str] = Field(default=None, description="Target vector collection")


class XMLUploadRequest(BaseModel):
    """Request for XML file processing."""
    file_path: str = Field(..., description="Path to the XML file")
    options: ProcessingOptionsRequest = Field(default_factory=ProcessingOptionsRequest)


class ResumeJobRequest(BaseModel):
    """Request to resume a job."""
    job_id: str = Field(..., description="ID of the job to resume")


class CancelJobRequest(BaseModel):
    """Request to cancel a job."""
    job_id: str = Field(..., description="ID of the job to cancel")


# Response schemas

class ExtractedEntityResponse(BaseModel):
    """Response for an extracted entity."""
    id: str
    type: EntityType
    title: str
    content: str = Field(default="", description="Entity content (may be truncated)")
    bookmark_id: Optional[str] = None
    parent_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExtractedRelationshipResponse(BaseModel):
    """Response for an extracted relationship."""
    source_id: str
    target_id: str
    relationship_type: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExtractedChunkResponse(BaseModel):
    """Response for an extracted chunk."""
    id: str
    content: str
    entity_id: str
    entity_type: EntityType
    bookmark_id: Optional[str] = None
    chunk_index: int = 0
    total_chunks: int = 1
    metadata: Dict[str, Any] = Field(default_factory=dict)
    glossary_term_ids: List[str] = Field(default_factory=list)


class JobResponse(BaseModel):
    """Response for a processing job."""
    job_id: str
    filename: str
    file_path: str
    status: JobStatus
    progress: float = Field(ge=0.0, le=1.0)
    total_chunks: int = 0
    completed_chunks: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    options: Dict[str, Any] = Field(default_factory=dict)


class JobListResponse(BaseModel):
    """Response for job list."""
    jobs: List[JobResponse]
    total: int
    resumable_count: int = 0


class ProgressUpdateResponse(BaseModel):
    """Response for progress update (SSE)."""
    job_id: str
    stage: ProcessingStage
    progress: float
    message: str
    current_item: Optional[str] = None
    items_completed: int = 0
    items_total: int = 0
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class ProcessingResultResponse(BaseModel):
    """Response for completed processing."""
    document_id: str
    filename: str
    entities_count: int
    relationships_count: int
    chunks_count: int
    glossary_terms_count: int
    processing_time_seconds: float
    entities_by_type: Dict[str, int]
    relationships_by_type: Dict[str, int]


class PresetConfigResponse(BaseModel):
    """Response for a processing preset configuration."""
    name: str
    description: str
    entity_patterns: Dict[str, str]
    schicht_mapping: Dict[str, str]
    role_patterns: List[str]
    glossary_linking: str
    extract_glossary: bool
    track_discontinued: bool
    store_bookmark_ids: bool


class PresetListResponse(BaseModel):
    """Response for available presets."""
    presets: List[PresetConfigResponse]


# Graph schemas

class GraphNodeResponse(BaseModel):
    """Response for a graph node."""
    id: str
    type: str
    title: str
    properties: Dict[str, Any] = Field(default_factory=dict)


class GraphEdgeResponse(BaseModel):
    """Response for a graph edge."""
    source_id: str
    target_id: str
    relationship_type: str
    properties: Dict[str, Any] = Field(default_factory=dict)


class GraphExplorationResponse(BaseModel):
    """Response for graph exploration."""
    center_node: GraphNodeResponse
    nodes: List[GraphNodeResponse]
    edges: List[GraphEdgeResponse]
    depth_reached: int


class GraphStatsResponse(BaseModel):
    """Response for graph statistics."""
    total_nodes: int
    total_relationships: int
    total_documents: int
    nodes_by_type: Dict[str, int]
    relationships_by_type: Dict[str, int]


class GraphContextResponse(BaseModel):
    """Response for graph context in RAG."""
    entity_id: str
    center: Dict[str, str]
    related: Dict[str, List[Dict[str, str]]]
    relationships: List[Dict[str, str]]


# Settings schemas

class GraphSettingsRequest(BaseModel):
    """Request to update graph settings."""
    default_depth: Optional[int] = Field(None, ge=1, le=10)
    max_depth: Optional[int] = Field(None, ge=1, le=10)
    job_retention_days: Optional[int] = Field(None, ge=1, le=365)


class GraphSettingsResponse(BaseModel):
    """Response for graph settings."""
    neo4j_uri: str
    default_depth: int
    max_depth: int
    job_retention_days: int
    neo4j_connected: bool = False
