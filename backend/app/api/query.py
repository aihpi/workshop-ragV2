"""Query API routes with RAG, Graph RAG, and streaming."""
import json
from typing import AsyncGenerator, Optional, List, Dict, Any
from enum import Enum
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas import QueryRequest, QueryResponse, RetrievedChunk
from app.services import (
    EmbeddingService,
    QdrantService,
    LLMService,
    ChatHistoryManager,
)
from app.core.config import settings

router = APIRouter()

# Initialize services
embedding_service = EmbeddingService(model_name=settings.EMBEDDING_MODEL)
qdrant_service = QdrantService()
llm_service = LLMService()
chat_manager = ChatHistoryManager(history_folder=settings.CHAT_HISTORY_FOLDER)


class GraphRAGStrategy(str, Enum):
    """Graph RAG retrieval strategies."""
    NONE = "none"  # Standard vector-only RAG
    MERGE = "merge"  # Combine vector + graph results
    PRE_FILTER = "pre_filter"  # Use graph to filter before vector search
    POST_ENRICH = "post_enrich"  # Enrich vector results with graph context


async def get_graph_service():
    """Lazy import and get graph service."""
    try:
        from app.services.graph_service import get_graph_service as _get_graph_service
        return await _get_graph_service()
    except Exception:
        return None


async def apply_graph_rag_strategy(
    query: str,
    query_embedding: List[float],
    top_k: int,
    strategy: GraphRAGStrategy,
    graph_depth: int = None
) -> tuple[List[Dict], Optional[Dict[str, Any]]]:
    """Apply Graph RAG strategy to retrieval.
    
    Args:
        query: The query string
        query_embedding: Query embedding vector
        top_k: Number of results to return
        strategy: Graph RAG strategy to use
        graph_depth: Depth for graph exploration
        
    Returns:
        Tuple of (chunks, graph_context)
    """
    graph_context = None
    
    if strategy == GraphRAGStrategy.NONE:
        # Standard vector-only retrieval
        chunks = qdrant_service.search(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        return chunks, None
    
    graph_service = await get_graph_service()
    if not graph_service:
        # Fall back to standard retrieval if graph not available
        chunks = qdrant_service.search(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        return chunks, None
    
    depth = graph_depth or settings.GRAPH_DEFAULT_DEPTH
    
    if strategy == GraphRAGStrategy.PRE_FILTER:
        # Search graph first to find relevant entities
        graph_nodes = await graph_service.search_nodes(query, limit=top_k)
        
        if graph_nodes:
            # Get entity IDs from graph search
            entity_ids = [node.id for node in graph_nodes]
            
            # Filter vector search to these entities
            chunks = qdrant_service.search_with_entity_filter(
                query_embedding=query_embedding,
                entity_ids=entity_ids,
                top_k=top_k,
            )
            
            # Get graph context for these entities
            graph_context = await graph_service.get_context_for_entities(
                entity_ids=entity_ids[:5],  # Limit context entities
                depth=depth
            )
        else:
            # No graph results, fall back to standard search
            chunks = qdrant_service.search(
                query_embedding=query_embedding,
                top_k=top_k,
            )
    
    elif strategy == GraphRAGStrategy.POST_ENRICH:
        # Standard vector search first
        chunks = qdrant_service.search_with_metadata(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        
        # Extract entity IDs from results
        entity_ids = qdrant_service.get_entity_ids_from_results(chunks)
        
        if entity_ids:
            # Get graph context for retrieved entities
            graph_context = await graph_service.get_context_for_entities(
                entity_ids=entity_ids[:10],  # Limit context entities
                depth=depth
            )
            
            # Optionally get additional chunks from related entities
            if graph_context:
                related_entity_ids = set()
                for entity_id, ctx in graph_context.items():
                    for rel_type, related in ctx.get("related", {}).items():
                        for rel in related[:3]:  # Limit related per type
                            related_entity_ids.add(rel["id"])
                
                # Get chunks from related entities (not already in results)
                existing_entity_ids = set(entity_ids)
                new_entity_ids = list(related_entity_ids - existing_entity_ids)[:5]
                
                if new_entity_ids:
                    related_chunks = qdrant_service.get_chunks_by_entity_ids(
                        entity_ids=new_entity_ids,
                        limit=2  # Few chunks per related entity
                    )
                    # Add related chunks with lower "score"
                    for chunk in related_chunks:
                        chunk["score"] = 0.5  # Lower score for graph-derived
                        chunk["source"] = "graph_enrichment"
                    chunks.extend(related_chunks)
    
    elif strategy == GraphRAGStrategy.MERGE:
        # Parallel vector and graph search, then merge
        # Vector search
        vector_chunks = qdrant_service.search_with_metadata(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        
        # Graph search
        graph_nodes = await graph_service.search_nodes(query, limit=top_k)
        graph_entity_ids = [node.id for node in graph_nodes] if graph_nodes else []
        
        # Get chunks for graph-found entities
        graph_chunks = []
        if graph_entity_ids:
            graph_chunks = qdrant_service.get_chunks_by_entity_ids(
                entity_ids=graph_entity_ids,
                limit=3
            )
            for chunk in graph_chunks:
                chunk["score"] = 0.7  # Score for graph-derived chunks
                chunk["source"] = "graph_search"
        
        # Merge and deduplicate
        seen_ids = set()
        chunks = []
        
        # Add vector results first (higher priority)
        for chunk in vector_chunks:
            chunk_id = f"{chunk.get('entity_id', '')}:{chunk.get('chunk_index', 0)}"
            if chunk_id not in seen_ids:
                chunk["source"] = "vector_search"
                chunks.append(chunk)
                seen_ids.add(chunk_id)
        
        # Add graph results
        for chunk in graph_chunks:
            chunk_id = f"{chunk.get('entity_id', '')}:{chunk.get('chunk_index', 0)}"
            if chunk_id not in seen_ids:
                chunks.append(chunk)
                seen_ids.add(chunk_id)
        
        # Sort by score and limit
        chunks = sorted(chunks, key=lambda x: x.get("score", 0), reverse=True)[:top_k]
        
        # Get graph context
        all_entity_ids = qdrant_service.get_entity_ids_from_results(chunks)
        if all_entity_ids:
            graph_context = await graph_service.get_context_for_entities(
                entity_ids=all_entity_ids[:10],
                depth=depth
            )
    
    else:
        # Unknown strategy, fall back
        chunks = qdrant_service.search(
            query_embedding=query_embedding,
            top_k=top_k,
        )
    
    return chunks, graph_context


def format_graph_context_for_prompt(graph_context: Dict[str, Any]) -> str:
    """Format graph context for inclusion in LLM prompt.
    
    Args:
        graph_context: Graph context dictionary
        
    Returns:
        Formatted string for prompt
    """
    if not graph_context:
        return ""
    
    lines = ["\n--- Graph Context ---"]
    
    for entity_id, ctx in graph_context.items():
        center = ctx.get("center", {})
        lines.append(f"\nEntity: {center.get('title', entity_id)} ({center.get('type', 'unknown')})")
        
        related = ctx.get("related", {})
        for rel_type, entities in related.items():
            if entities:
                entity_list = ", ".join([e.get("title", e.get("id", "")) for e in entities[:3]])
                lines.append(f"  - Related {rel_type}: {entity_list}")
    
    lines.append("--- End Graph Context ---\n")
    return "\n".join(lines)


@router.get("/search")
async def search_documents(
    query: str,
    top_k: int = 10,
    score_threshold: float = 0.0,
):
    """Search documents without generating an answer.
    
    Args:
        query: Search query
        top_k: Number of chunks to retrieve
        score_threshold: Minimum score threshold
        
    Returns:
        Retrieved chunks only
    """
    try:
        # Generate query embedding
        query_embedding = embedding_service.embed_text(query)
        
        # Retrieve relevant chunks
        chunks = qdrant_service.search(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        
        # Filter by score threshold
        filtered_chunks = [
            chunk for chunk in chunks 
            if chunk["score"] >= score_threshold
        ]
        
        return {
            "query": query,
            "chunks": [RetrievedChunk(**chunk) for chunk in filtered_chunks],
            "metadata": {
                "top_k": top_k,
                "score_threshold": score_threshold,
                "total_results": len(filtered_chunks),
                "retrieved_before_filter": len(chunks),
            },
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching documents: {str(e)}")


@router.post("/query")
async def query_rag(request: QueryRequest) -> QueryResponse:
    """Non-streaming RAG query.
    
    Args:
        request: Query request parameters
        
    Returns:
        Query response with answer and chunks
    """
    try:
        # Generate query embedding
        query_embedding = embedding_service.embed_text(request.query)
        
        # Retrieve relevant chunks
        chunks = qdrant_service.search(
            query_embedding=query_embedding,
            top_k=request.top_k,
        )
        
        # Get chat history if requested
        chat_history = None
        if request.use_chat_history and request.chat_id:
            chat_history = chat_manager.get_history(
                request.chat_id,
                max_messages=settings.MAX_CHAT_HISTORY,
            )
        
        # Create prompt
        chunk_texts = [chunk["content"] for chunk in chunks]
        prompt = llm_service.create_prompt(
            query=request.query,
            context_chunks=chunk_texts,
            chat_history=chat_history,
        )
        
        # Generate answer
        answer = await llm_service.generate(
            prompt=prompt,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            top_p=request.top_p,
            top_k=request.top_k_sampling,
        )
        
        # Save to chat history if requested
        if request.use_chat_history and request.chat_id:
            chat_manager.add_message(
                session_id=request.chat_id,
                query=request.query,
                answer=answer,
                chunks=chunks,
            )
        
        return QueryResponse(
            query=request.query,
            answer=answer,
            retrieved_chunks=[RetrievedChunk(**chunk) for chunk in chunks],
            metadata={
                "temperature": request.temperature,
                "max_tokens": request.max_tokens,
                "top_k": request.top_k,
                "use_chat_history": request.use_chat_history,
            },
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@router.get("/llm/stream")
async def query_llm_stream(
    query: str,
    temperature: float = 0.7,
    max_tokens: int = 512,
    top_p: float = 0.9,
    top_k: int = 40,
):
    """Stream LLM response directly without RAG.
    
    Args:
        query: Query string
        temperature: LLM temperature
        max_tokens: Maximum tokens to generate
        top_p: LLM top_p parameter
        top_k: LLM top_k parameter
        
    Returns:
        Streaming response
    """
    async def generate() -> AsyncGenerator[str, None]:
        try:
            # Create a simple prompt without context
            prompt = f"User: {query}\n\nAssistant:"
            
            # Stream answer directly from LLM
            async for token in llm_service.generate_stream(
                prompt=prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                top_k=top_k,
            ):
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
            
            # Send completion
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        },
    )


@router.get("/query/stream")
async def query_rag_stream(
    query: str,
    top_k: int = 5,
    temperature: float = 0.7,
    max_tokens: int = 512,
    top_p: float = 0.9,
    top_k_sampling: int = 40,
    use_chat_history: bool = False,
    chat_id: Optional[str] = None,
    prompt: Optional[str] = None,
    graph_rag_strategy: str = "none",
    graph_depth: Optional[int] = None,
):
    """Streaming RAG query using Server-Sent Events with optional Graph RAG.
    
    Args:
        query: Query string
        top_k: Number of chunks to retrieve
        temperature: LLM temperature
        max_tokens: Maximum tokens to generate
        top_p: LLM top_p parameter
        top_k_sampling: LLM top_k parameter
        use_chat_history: Whether to use chat history
        chat_id: Chat session ID
        prompt: Custom prompt template (optional)
        graph_rag_strategy: Graph RAG strategy (none, merge, pre_filter, post_enrich)
        graph_depth: Depth for graph exploration (default from settings)
        
    Returns:
        Streaming response
    """
    async def generate() -> AsyncGenerator[str, None]:
        try:
            # Parse graph strategy
            try:
                strategy = GraphRAGStrategy(graph_rag_strategy)
            except ValueError:
                strategy = GraphRAGStrategy.NONE
            
            # Generate query embedding
            query_embedding = embedding_service.embed_text(query)
            
            # Apply Graph RAG strategy
            chunks, graph_context = await apply_graph_rag_strategy(
                query=query,
                query_embedding=query_embedding,
                top_k=top_k,
                strategy=strategy,
                graph_depth=graph_depth
            )
            
            # Send chunks first (with graph context metadata)
            chunks_response = {
                'type': 'chunks',
                'chunks': chunks,
                'graph_rag_strategy': strategy.value,
            }
            if graph_context:
                chunks_response['has_graph_context'] = True
            yield f"data: {json.dumps(chunks_response)}\n\n"
            
            # Get chat history if requested
            chat_history = None
            if use_chat_history and chat_id:
                chat_history = chat_manager.get_history(
                    chat_id,
                    max_messages=settings.MAX_CHAT_HISTORY,
                )
            
            # Create prompt
            chunk_texts = [chunk["content"] for chunk in chunks]
            
            # Add graph context if available
            graph_context_text = format_graph_context_for_prompt(graph_context)
            
            if prompt:
                # Use custom prompt template
                context_text = "\n\n".join([f"Passage {i+1}:\n{text}" for i, text in enumerate(chunk_texts)])
                if graph_context_text:
                    context_text += graph_context_text
                    
                history_text = ""
                if chat_history:
                    history_text = "\n".join([f"User: {msg['query']}\nAssistant: {msg['answer']}" for msg in chat_history])
                
                # Replace placeholders in the custom prompt
                formatted_prompt = prompt.replace("{context}", context_text)
                formatted_prompt = formatted_prompt.replace("{query}", query)
                formatted_prompt = formatted_prompt.replace("{question}", query)
                formatted_prompt = formatted_prompt.replace("{history}", history_text)
                formatted_prompt = formatted_prompt.replace("{graph_context}", graph_context_text)
                
                final_prompt = formatted_prompt
            else:
                # Use default prompt from LLM service, append graph context
                final_prompt = llm_service.create_prompt(
                    query=query,
                    context_chunks=chunk_texts,
                    chat_history=chat_history,
                )
                if graph_context_text:
                    # Insert graph context before the query
                    final_prompt = final_prompt.replace(
                        f"Question: {query}",
                        f"{graph_context_text}\nQuestion: {query}"
                    )
            
            # Stream answer
            full_answer = ""
            async for token in llm_service.generate_stream(
                prompt=final_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                top_k=top_k_sampling,
            ):
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
            
            # Send completion
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
            # Save to chat history if requested
            if use_chat_history and chat_id:
                chat_manager.add_message(
                    session_id=chat_id,
                    query=query,
                    answer=full_answer,
                    chunks=chunks,
                )
        
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        },
    )


@router.get("/graph/explore/{node_id}")
async def explore_graph(
    node_id: str,
    depth: int = None,
    relationship_types: Optional[str] = None,
):
    """Explore the knowledge graph from a starting node.
    
    Args:
        node_id: Starting node ID
        depth: Exploration depth (default from settings)
        relationship_types: Comma-separated relationship types to follow
        
    Returns:
        Graph exploration result
    """
    try:
        graph_service = await get_graph_service()
        if not graph_service:
            raise HTTPException(status_code=503, detail="Graph service not available")
        
        rel_types = relationship_types.split(",") if relationship_types else None
        
        result = await graph_service.explore_graph(
            start_node_id=node_id,
            depth=depth,
            relationship_types=rel_types,
        )
        
        if not result:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        
        return result.to_dict()
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exploring graph: {str(e)}")


@router.get("/graph/stats")
async def get_graph_stats():
    """Get knowledge graph statistics.
    
    Returns:
        Graph statistics
    """
    try:
        graph_service = await get_graph_service()
        if not graph_service:
            raise HTTPException(status_code=503, detail="Graph service not available")
        
        return await graph_service.get_graph_stats()
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting graph stats: {str(e)}")
