"""Ollama models API endpoints."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Dict, Any
from pydantic import BaseModel
import httpx
import json

from app.services.llm_service import LLMService
from app.core.config import settings

router = APIRouter()


class ModelInfo(BaseModel):
    """Model information."""
    id: str
    name: str
    size: str
    active: bool


class ModelSetActiveRequest(BaseModel):
    """Request to set active model."""
    model_id: str


class ModelPullRequest(BaseModel):
    """Request to pull/download a model."""
    model_id: str


class OllamaStatus(BaseModel):
    """Ollama connection status."""
    connected: bool
    models: List[str]
    error: str | None = None


@router.get("/")
async def get_models() -> Dict[str, Any]:
    """Get list of available Ollama models."""
    llm_service = LLMService()
    
    # Check Ollama connection
    status = await LLMService.check_connection()
    if not status["connected"]:
        return {
            "models": [],
            "error": status["error"],
            "connected": False
        }
    
    # Get available models from Ollama
    models = await llm_service.list_models()
    current_model = await llm_service.get_active_model()
    
    formatted_models = []
    for model in models:
        model_name = model.get("name", "")
        # Parse size from model info
        size_bytes = model.get("size", 0)
        if size_bytes > 0:
            size_gb = size_bytes / (1024 ** 3)
            size_str = f"{size_gb:.1f}GB"
        else:
            size_str = "Unknown"
        
        formatted_models.append(ModelInfo(
            id=model_name,
            name=model_name,
            size=size_str,
            active=model_name == current_model
        ))
    
    return {
        "models": formatted_models,
        "connected": True,
        "active_model": current_model
    }


@router.post("/set-active")
async def set_active_model(request: ModelSetActiveRequest) -> Dict[str, Any]:
    """Set a model as active."""
    llm_service = LLMService()
    
    # Check Ollama connection
    status = await LLMService.check_connection()
    if not status["connected"]:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama not available: {status['error']}"
        )
    
    # Verify the model exists
    if request.model_id not in status["models"]:
        raise HTTPException(
            status_code=404,
            detail=f"Model {request.model_id} not found in Ollama. Use 'ollama pull {request.model_id}' to download it."
        )
    
    # Set the active model
    await llm_service.set_active_model(request.model_id)
    
    return {
        "status": "success",
        "message": f"Model {request.model_id} is now active",
        "active_model": request.model_id
    }


@router.get("/active")
async def get_active_model() -> Dict[str, Any]:
    """Get the currently active model."""
    llm_service = LLMService()
    current_model = await llm_service.get_active_model()
    
    return {
        "active_model": current_model,
        "model_name": current_model
    }


@router.get("/status")
async def get_ollama_status() -> OllamaStatus:
    """Get Ollama connection status."""
    status = await LLMService.check_connection()
    return OllamaStatus(
        connected=status["connected"],
        models=status["models"],
        error=status.get("error")
    )


@router.post("/pull")
async def pull_model(request: ModelPullRequest):
    """Pull/download a model from Ollama registry.
    
    Streams progress updates as JSON lines.
    """
    async def generate():
        ollama_url = f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/pull"
        
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream(
                    "POST",
                    ollama_url,
                    json={"name": request.model_id, "stream": True}
                ) as response:
                    if response.status_code != 200:
                        yield json.dumps({"error": f"Failed to pull model: HTTP {response.status_code}"}) + "\n"
                        return
                    
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                data = json.loads(line)
                                yield json.dumps(data) + "\n"
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                yield json.dumps({"error": str(e)}) + "\n"
    
    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.delete("/{model_id:path}")
async def delete_model(model_id: str) -> Dict[str, Any]:
    """Delete a model from Ollama."""
    ollama_url = f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/delete"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.delete(
                ollama_url,
                json={"name": model_id}
            )
            
            if response.status_code == 200:
                return {"success": True, "message": f"Model {model_id} deleted"}
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to delete model: {response.text}"
                )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot connect to Ollama: {str(e)}"
            )
