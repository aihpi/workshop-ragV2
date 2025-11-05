"""Query API routes with RAG and streaming."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator

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


@router.post("/query/stream")
async def query_rag_stream(request: QueryRequest):
    """Streaming RAG query using Server-Sent Events.
    
    Args:
        request: Query request parameters
        
    Returns:
        Streaming response
    """
    async def generate() -> AsyncGenerator[str, None]:
        try:
            # Generate query embedding
            query_embedding = embedding_service.embed_text(request.query)
            
            # Retrieve relevant chunks
            chunks = qdrant_service.search(
                query_embedding=query_embedding,
                top_k=request.top_k,
            )
            
            # Send chunks first
            import json
            yield f"data: {json.dumps({'type': 'chunks', 'chunks': chunks})}\n\n"
            
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
            
            # Stream answer
            full_answer = ""
            async for token in llm_service.generate_stream(
                prompt=prompt,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                top_p=request.top_p,
                top_k=request.top_k_sampling,
            ):
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
            
            # Send completion
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
            # Save to chat history if requested
            if request.use_chat_history and request.chat_id:
                chat_manager.add_message(
                    session_id=request.chat_id,
                    query=request.query,
                    answer=full_answer,
                    chunks=chunks,
                )
        
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
    )
