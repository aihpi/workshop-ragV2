"""Neo4j Graph Service for IT-Grundschutz knowledge graph.

Provides CRUD operations for graph entities and relationships,
depth-limited graph exploration, and cascade delete functionality.
"""
import asyncio
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass
from neo4j import AsyncGraphDatabase, AsyncDriver
from neo4j.exceptions import ServiceUnavailable, DriverError

from app.core.config import settings
from app.services.xml_processor import EntityType, ExtractedEntity, ExtractedRelationship


@dataclass
class GraphNode:
    """Represents a node in the knowledge graph."""
    id: str
    type: str
    title: str
    properties: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "properties": self.properties
        }


@dataclass
class GraphEdge:
    """Represents an edge (relationship) in the knowledge graph."""
    source_id: str
    target_id: str
    relationship_type: str
    properties: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_id": self.source_id,
            "target_id": self.target_id,
            "relationship_type": self.relationship_type,
            "properties": self.properties
        }


@dataclass
class GraphExplorationResult:
    """Result of a graph exploration query."""
    center_node: GraphNode
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    depth_reached: int
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "center_node": self.center_node.to_dict(),
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "depth_reached": self.depth_reached
        }


class GraphService:
    """Service for Neo4j knowledge graph operations.
    
    Supports:
    - Creating nodes for different entity types (Schicht, Baustein, etc.)
    - Creating relationships (BELONGS_TO, REFERENCES, ZUSTAENDIG_FUER, etc.)
    - Depth-limited graph exploration
    - Cascade delete for document cleanup
    - Graph context retrieval for RAG queries
    """
    
    # Relationship types used in the graph
    RELATIONSHIP_TYPES = [
        "BELONGS_TO",      # Child -> Parent hierarchy
        "REFERENCES",      # Cross-references between entities
        "ZUSTAENDIG_FUER", # Role -> Anforderung responsibility
        "BASIERT_AUF",     # Entity -> Standard reference
        "USES_TERM"        # Entity -> GlossaryTerm usage
    ]
    
    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        default_depth: Optional[int] = None,
        max_depth: Optional[int] = None
    ):
        """Initialize the Graph Service.
        
        Args:
            uri: Neo4j connection URI
            user: Neo4j username
            password: Neo4j password
            default_depth: Default exploration depth
            max_depth: Maximum allowed exploration depth
        """
        self.uri = uri or settings.NEO4J_URI
        self.user = user or settings.NEO4J_USER
        self.password = password or settings.NEO4J_PASSWORD
        self.default_depth = default_depth or settings.GRAPH_DEFAULT_DEPTH
        self.max_depth = max_depth or settings.GRAPH_MAX_DEPTH
        self._driver: Optional[AsyncDriver] = None
    
    async def connect(self) -> None:
        """Establish connection to Neo4j."""
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password) if self.password else None
            )
            # Verify connectivity
            try:
                await self._driver.verify_connectivity()
            except ServiceUnavailable as e:
                self._driver = None
                raise ConnectionError(f"Cannot connect to Neo4j: {e}")
    
    async def close(self) -> None:
        """Close the Neo4j connection."""
        if self._driver:
            await self._driver.close()
            self._driver = None
    
    async def _ensure_connection(self) -> None:
        """Ensure connection is established."""
        if self._driver is None:
            await self.connect()
    
    async def init_schema(self) -> None:
        """Initialize graph schema with constraints and indexes."""
        await self._ensure_connection()
        
        async with self._driver.session() as session:
            # Create uniqueness constraints for each entity type
            for entity_type in EntityType:
                constraint_name = f"constraint_{entity_type.value}_id"
                try:
                    await session.run(f"""
                        CREATE CONSTRAINT {constraint_name} IF NOT EXISTS
                        FOR (n:{entity_type.value.upper()})
                        REQUIRE n.id IS UNIQUE
                    """)
                except Exception:
                    # Constraint might already exist
                    pass
            
            # Create indexes for common lookups
            try:
                await session.run("""
                    CREATE INDEX idx_node_document_id IF NOT EXISTS
                    FOR (n:Entity)
                    ON (n.document_id)
                """)
            except Exception:
                pass
    
    async def create_node(
        self,
        entity: ExtractedEntity,
        document_id: str
    ) -> str:
        """Create a node in the graph from an extracted entity.
        
        Args:
            entity: The extracted entity
            document_id: ID of the source document
            
        Returns:
            The node ID
        """
        await self._ensure_connection()
        
        node_type = entity.type.value.upper()
        
        properties = {
            "id": entity.id,
            "title": entity.title,
            "content": entity.content[:5000] if entity.content else "",  # Truncate for storage
            "document_id": document_id,
            "entity_type": entity.type.value
        }
        
        if entity.bookmark_id:
            properties["bookmark_id"] = entity.bookmark_id
        
        if entity.parent_id:
            properties["parent_id"] = entity.parent_id
        
        # Add metadata fields
        for key, value in entity.metadata.items():
            if isinstance(value, (str, int, float, bool)):
                properties[key] = value
            elif isinstance(value, list) and all(isinstance(v, str) for v in value):
                properties[key] = value
        
        async with self._driver.session() as session:
            query = f"""
                MERGE (n:{node_type} {{id: $id}})
                SET n += $properties
                SET n:Entity
                RETURN n.id as node_id
            """
            result = await session.run(query, id=entity.id, properties=properties)
            record = await result.single()
            return record["node_id"] if record else entity.id
    
    async def create_nodes_batch(
        self,
        entities: List[ExtractedEntity],
        document_id: str,
        batch_size: int = 100
    ) -> int:
        """Create multiple nodes in batches.
        
        Args:
            entities: List of entities to create
            document_id: ID of the source document
            batch_size: Number of nodes per batch
            
        Returns:
            Number of nodes created
        """
        await self._ensure_connection()
        
        created_count = 0
        
        for i in range(0, len(entities), batch_size):
            batch = entities[i:i + batch_size]
            
            async with self._driver.session() as session:
                for entity in batch:
                    try:
                        await self.create_node(entity, document_id)
                        created_count += 1
                    except Exception as e:
                        # Log but continue
                        print(f"Error creating node {entity.id}: {e}")
        
        return created_count
    
    async def create_relationship(
        self,
        relationship: ExtractedRelationship
    ) -> bool:
        """Create a relationship between two nodes.
        
        Args:
            relationship: The relationship to create
            
        Returns:
            True if created successfully
        """
        await self._ensure_connection()
        
        async with self._driver.session() as session:
            query = f"""
                MATCH (source:Entity {{id: $source_id}})
                MATCH (target:Entity {{id: $target_id}})
                MERGE (source)-[r:{relationship.relationship_type}]->(target)
                SET r += $properties
                RETURN type(r) as rel_type
            """
            try:
                result = await session.run(
                    query,
                    source_id=relationship.source_id,
                    target_id=relationship.target_id,
                    properties=relationship.metadata
                )
                record = await result.single()
                return record is not None
            except Exception:
                return False
    
    async def create_relationships_batch(
        self,
        relationships: List[ExtractedRelationship],
        batch_size: int = 100
    ) -> int:
        """Create multiple relationships in batches.
        
        Args:
            relationships: List of relationships to create
            batch_size: Number of relationships per batch
            
        Returns:
            Number of relationships created
        """
        await self._ensure_connection()
        
        created_count = 0
        
        for i in range(0, len(relationships), batch_size):
            batch = relationships[i:i + batch_size]
            
            for rel in batch:
                if await self.create_relationship(rel):
                    created_count += 1
        
        return created_count
    
    async def get_node(self, node_id: str) -> Optional[GraphNode]:
        """Get a node by ID.
        
        Args:
            node_id: The node ID
            
        Returns:
            GraphNode if found, None otherwise
        """
        await self._ensure_connection()
        
        async with self._driver.session() as session:
            result = await session.run("""
                MATCH (n:Entity {id: $id})
                RETURN n, labels(n) as labels
            """, id=node_id)
            
            record = await result.single()
            if record:
                node = record["n"]
                labels = [l for l in record["labels"] if l != "Entity"]
                return GraphNode(
                    id=node["id"],
                    type=labels[0].lower() if labels else "unknown",
                    title=node.get("title", ""),
                    properties=dict(node)
                )
        return None
    
    async def explore_graph(
        self,
        start_node_id: str,
        depth: Optional[int] = None,
        relationship_types: Optional[List[str]] = None,
        direction: str = "both"  # "out", "in", or "both"
    ) -> Optional[GraphExplorationResult]:
        """Explore the graph from a starting node up to a certain depth.
        
        Args:
            start_node_id: ID of the starting node
            depth: How many hops to explore (capped at max_depth)
            relationship_types: Optional filter for relationship types
            direction: Direction of relationships to follow
            
        Returns:
            GraphExplorationResult with nodes and edges
        """
        await self._ensure_connection()
        
        # Cap depth at max
        if depth is None:
            depth = self.default_depth
        depth = min(depth, self.max_depth)
        
        # Build relationship filter
        rel_filter = ""
        if relationship_types:
            rel_filter = ":" + "|".join(relationship_types)
        
        # Direction syntax
        if direction == "out":
            pattern = f"-[r{rel_filter}*0..{depth}]->"
        elif direction == "in":
            pattern = f"<-[r{rel_filter}*0..{depth}]-"
        else:
            pattern = f"-[r{rel_filter}*0..{depth}]-"
        
        async with self._driver.session() as session:
            query = f"""
                MATCH path = (start:Entity {{id: $start_id}}){pattern}(end:Entity)
                WITH start, collect(DISTINCT end) as nodes, 
                     collect(DISTINCT relationships(path)) as all_rels
                UNWIND all_rels as rels
                UNWIND rels as rel
                WITH start, nodes, collect(DISTINCT rel) as unique_rels
                RETURN start, nodes, unique_rels
            """
            
            result = await session.run(query, start_id=start_node_id)
            record = await result.single()
            
            if not record:
                # Node not found or no connections
                center = await self.get_node(start_node_id)
                if center:
                    return GraphExplorationResult(
                        center_node=center,
                        nodes=[center],
                        edges=[],
                        depth_reached=0
                    )
                return None
            
            start_node = record["start"]
            nodes_data = record["nodes"]
            rels_data = record["unique_rels"]
            
            # Convert to GraphNode objects
            nodes = []
            seen_ids: Set[str] = set()
            
            # Add center node
            center_node = GraphNode(
                id=start_node["id"],
                type=start_node.get("entity_type", "unknown"),
                title=start_node.get("title", ""),
                properties=dict(start_node)
            )
            nodes.append(center_node)
            seen_ids.add(center_node.id)
            
            for node in nodes_data:
                if node["id"] not in seen_ids:
                    nodes.append(GraphNode(
                        id=node["id"],
                        type=node.get("entity_type", "unknown"),
                        title=node.get("title", ""),
                        properties=dict(node)
                    ))
                    seen_ids.add(node["id"])
            
            # Convert relationships to GraphEdge objects
            edges = []
            for rel in rels_data:
                edges.append(GraphEdge(
                    source_id=rel.start_node["id"],
                    target_id=rel.end_node["id"],
                    relationship_type=rel.type,
                    properties=dict(rel)
                ))
            
            return GraphExplorationResult(
                center_node=center_node,
                nodes=nodes,
                edges=edges,
                depth_reached=depth
            )
    
    async def get_context_for_entities(
        self,
        entity_ids: List[str],
        depth: int = 1
    ) -> Dict[str, Any]:
        """Get graph context for a list of entities (for RAG enrichment).
        
        Args:
            entity_ids: List of entity IDs to get context for
            depth: Depth of context to retrieve
            
        Returns:
            Dict with context information organized by entity
        """
        await self._ensure_connection()
        
        depth = min(depth, self.max_depth)
        context = {}
        
        for entity_id in entity_ids:
            exploration = await self.explore_graph(entity_id, depth=depth)
            if exploration:
                # Collect related entities by type
                related = {}
                for node in exploration.nodes:
                    if node.id != entity_id:
                        node_type = node.type
                        if node_type not in related:
                            related[node_type] = []
                        related[node_type].append({
                            "id": node.id,
                            "title": node.title
                        })
                
                # Collect relationships
                relationships = []
                for edge in exploration.edges:
                    relationships.append({
                        "type": edge.relationship_type,
                        "from": edge.source_id,
                        "to": edge.target_id
                    })
                
                context[entity_id] = {
                    "center": {
                        "id": exploration.center_node.id,
                        "title": exploration.center_node.title,
                        "type": exploration.center_node.type
                    },
                    "related": related,
                    "relationships": relationships
                }
        
        return context
    
    async def delete_document_nodes(
        self,
        document_id: str,
        cascade: bool = True
    ) -> int:
        """Delete all nodes associated with a document.
        
        Args:
            document_id: The document ID
            cascade: Whether to delete orphaned relationships
            
        Returns:
            Number of nodes deleted
        """
        await self._ensure_connection()
        
        async with self._driver.session() as session:
            # First count nodes to delete
            count_result = await session.run("""
                MATCH (n:Entity {document_id: $doc_id})
                RETURN count(n) as count
            """, doc_id=document_id)
            count_record = await count_result.single()
            count = count_record["count"] if count_record else 0
            
            if cascade:
                # Delete nodes and their relationships
                await session.run("""
                    MATCH (n:Entity {document_id: $doc_id})
                    DETACH DELETE n
                """, doc_id=document_id)
            else:
                # Delete only nodes
                await session.run("""
                    MATCH (n:Entity {document_id: $doc_id})
                    DELETE n
                """, doc_id=document_id)
            
            return count
    
    async def get_graph_stats(self) -> Dict[str, Any]:
        """Get statistics about the knowledge graph.
        
        Returns:
            Dict with node counts, relationship counts, etc.
        """
        await self._ensure_connection()
        
        async with self._driver.session() as session:
            # Count nodes by type
            node_counts = {}
            for entity_type in EntityType:
                result = await session.run(f"""
                    MATCH (n:{entity_type.value.upper()})
                    RETURN count(n) as count
                """)
                record = await result.single()
                node_counts[entity_type.value] = record["count"] if record else 0
            
            # Count relationships by type
            rel_counts = {}
            for rel_type in self.RELATIONSHIP_TYPES:
                result = await session.run(f"""
                    MATCH ()-[r:{rel_type}]->()
                    RETURN count(r) as count
                """)
                record = await result.single()
                rel_counts[rel_type] = record["count"] if record else 0
            
            # Total counts
            total_nodes_result = await session.run("""
                MATCH (n:Entity)
                RETURN count(n) as count
            """)
            total_nodes = (await total_nodes_result.single())["count"]
            
            total_rels_result = await session.run("""
                MATCH ()-[r]->()
                RETURN count(r) as count
            """)
            total_rels = (await total_rels_result.single())["count"]
            
            # Document count
            docs_result = await session.run("""
                MATCH (n:Entity)
                RETURN count(DISTINCT n.document_id) as count
            """)
            doc_count = (await docs_result.single())["count"]
            
            return {
                "total_nodes": total_nodes,
                "total_relationships": total_rels,
                "total_documents": doc_count,
                "nodes_by_type": node_counts,
                "relationships_by_type": rel_counts
            }
    
    async def find_path(
        self,
        start_id: str,
        end_id: str,
        max_hops: Optional[int] = None
    ) -> Optional[List[Dict[str, Any]]]:
        """Find the shortest path between two nodes.
        
        Args:
            start_id: Starting node ID
            end_id: Target node ID
            max_hops: Maximum path length
            
        Returns:
            List of nodes and relationships in the path, or None if no path exists
        """
        await self._ensure_connection()
        
        if max_hops is None:
            max_hops = self.max_depth
        max_hops = min(max_hops, self.max_depth)
        
        async with self._driver.session() as session:
            result = await session.run(f"""
                MATCH path = shortestPath(
                    (start:Entity {{id: $start_id}})-[*..{max_hops}]-(end:Entity {{id: $end_id}})
                )
                RETURN nodes(path) as nodes, relationships(path) as rels
            """, start_id=start_id, end_id=end_id)
            
            record = await result.single()
            if not record:
                return None
            
            path = []
            nodes = record["nodes"]
            rels = record["rels"]
            
            for i, node in enumerate(nodes):
                path.append({
                    "type": "node",
                    "id": node["id"],
                    "title": node.get("title", ""),
                    "entity_type": node.get("entity_type", "unknown")
                })
                if i < len(rels):
                    rel = rels[i]
                    path.append({
                        "type": "relationship",
                        "relationship_type": rel.type
                    })
            
            return path
    
    async def search_nodes(
        self,
        query: str,
        entity_types: Optional[List[EntityType]] = None,
        limit: int = 10
    ) -> List[GraphNode]:
        """Search for nodes by title or content.
        
        Args:
            query: Search query
            entity_types: Optional filter by entity types
            limit: Maximum results
            
        Returns:
            List of matching GraphNode objects
        """
        await self._ensure_connection()
        
        type_filter = ""
        if entity_types:
            type_labels = [f"n:{t.value.upper()}" for t in entity_types]
            type_filter = f"WHERE ({' OR '.join(type_labels)})"
        
        async with self._driver.session() as session:
            cypher = f"""
                MATCH (n:Entity)
                {type_filter}
                WHERE toLower(n.title) CONTAINS toLower($search_term)
                   OR toLower(n.content) CONTAINS toLower($search_term)
                RETURN n, labels(n) as labels
                LIMIT $max_results
            """
            result = await session.run(cypher, search_term=query, max_results=limit)
            
            nodes = []
            async for record in result:
                node = record["n"]
                labels = [l for l in record["labels"] if l != "Entity"]
                nodes.append(GraphNode(
                    id=node["id"],
                    type=labels[0].lower() if labels else "unknown",
                    title=node.get("title", ""),
                    properties=dict(node)
                ))
            
            return nodes


# Singleton instance
_graph_service: Optional[GraphService] = None


async def get_graph_service() -> GraphService:
    """Get or create the graph service singleton."""
    global _graph_service
    if _graph_service is None:
        _graph_service = GraphService()
        await _graph_service.connect()
        await _graph_service.init_schema()
    return _graph_service


async def close_graph_service() -> None:
    """Close the graph service connection."""
    global _graph_service
    if _graph_service:
        await _graph_service.close()
        _graph_service = None
