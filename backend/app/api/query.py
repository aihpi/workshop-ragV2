"""Query API routes with RAG and streaming."""
import json
from typing import AsyncGenerator, Optional
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
):
    """Streaming RAG query using Server-Sent Events.
    
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
        
    Returns:
        Streaming response
    """
    async def generate() -> AsyncGenerator[str, None]:
        try:
            # Generate query embedding
            query_embedding = embedding_service.embed_text(query)
            
            # Retrieve relevant chunks
            chunks = qdrant_service.search(
                query_embedding=query_embedding,
                top_k=top_k,
            )
            
            # Send chunks first
            yield f"data: {json.dumps({'type': 'chunks', 'chunks': chunks})}\n\n"
            
            # Get chat history if requested
            chat_history = None
            if use_chat_history and chat_id:
                chat_history = chat_manager.get_history(
                    chat_id,
                    max_messages=settings.MAX_CHAT_HISTORY,
                )
            
            # Create prompt
            chunk_texts = [chunk["content"] for chunk in chunks]
            
            if prompt:
                # Use custom prompt template
                # Format the custom prompt with context and query
                context_text = "\n\n".join([f"Passage {i+1}:\n{text}" for i, text in enumerate(chunk_texts)])
                history_text = ""
                if chat_history:
                    history_text = "\n".join([f"User: {msg['query']}\nAssistant: {msg['answer']}" for msg in chat_history])
                
                # Replace placeholders in the custom prompt
                formatted_prompt = prompt.replace("{context}", context_text)
                formatted_prompt = formatted_prompt.replace("{query}", query)
                formatted_prompt = formatted_prompt.replace("{question}", query)  # Support both {query} and {question}
                formatted_prompt = formatted_prompt.replace("{history}", history_text)
                
                final_prompt = formatted_prompt
            else:
                # Use default prompt from LLM service
                final_prompt = llm_service.create_prompt(
                    query=query,
                    context_chunks=chunk_texts,
                    chat_history=chat_history,
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
