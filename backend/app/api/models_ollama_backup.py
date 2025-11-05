from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import asyncio
import os
import subprocess
from pydantic import BaseModel

router = APIRouter()

class ModelInfo(BaseModel):
    id: str
    name: str
    downloaded: bool
    active: bool
    size: str = ""

class ModelDownloadRequest(BaseModel):
    model_id: str

class ModelSetActiveRequest(BaseModel):
    model_id: str

# Available models configuration
AVAILABLE_MODELS = {
    "qwen2.5:1.5b-instruct": {
        "name": "Qwen2.5 1.5B Instruct",
        "size": "1.5GB"
    },
    "qwen2.5:3b-instruct": {
        "name": "Qwen2.5 3B Instruct", 
        "size": "3.2GB"
    },
    "qwen2.5:7b-instruct": {
        "name": "Qwen2.5 7B Instruct",
        "size": "7.4GB"
    }
}

# Global state for tracking downloads and active model
download_progress = {}
active_model = "qwen2.5:1.5b-instruct"  # Default

def check_model_downloaded(model_id: str) -> bool:
    """Check if a model is downloaded locally using ollama list"""
    try:
        result = subprocess.run(
            ["ollama", "list"], 
            capture_output=True, 
            text=True, 
            check=True
        )
        return model_id in result.stdout
    except subprocess.CalledProcessError:
        return False
    except FileNotFoundError:
        # ollama not installed
        return False

def get_downloaded_models() -> List[str]:
    """Get list of downloaded models"""
    try:
        result = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            check=True
        )
        lines = result.stdout.strip().split('\n')[1:]  # Skip header
        models = []
        for line in lines:
            if line.strip():
                model_name = line.split()[0]
                models.append(model_name)
        return models
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []

@router.get("/models")
async def get_models() -> Dict[str, Any]:
    """Get list of available models with their status"""
    models = []
    downloaded_models = get_downloaded_models()
    
    for model_id, config in AVAILABLE_MODELS.items():
        models.append(ModelInfo(
            id=model_id,
            name=config["name"],
            downloaded=model_id in downloaded_models,
            active=model_id == active_model,
            size=config["size"]
        ))
    
    return {"models": models}

@router.post("/models/download")
async def download_model(request: ModelDownloadRequest) -> Dict[str, Any]:
    """Download a model using ollama"""
    model_id = request.model_id
    
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if model_id in download_progress:
        raise HTTPException(status_code=400, detail="Model download already in progress")
    
    # Start download in background
    download_progress[model_id] = {"progress": 0, "status": "downloading"}
    
    async def download_task():
        try:
            # Use a simple progress simulation that works reliably
            download_progress[model_id] = {"progress": 5, "status": "downloading"}
            
            # Start the actual ollama pull process
            process = await asyncio.create_subprocess_exec(
                "ollama", "pull", model_id,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Simulate progress while download is happening
            progress_value = 5
            while process.returncode is None:
                await asyncio.sleep(2)  # Check every 2 seconds
                
                # Increment progress slowly
                if progress_value < 90:
                    progress_value += 10
                    download_progress[model_id] = {"progress": progress_value, "status": "downloading"}
                
                # Check if process is still running
                try:
                    await asyncio.wait_for(process.wait(), timeout=0.1)
                    break
                except asyncio.TimeoutError:
                    continue
            
            # Wait for process to complete
            await process.wait()
            
            if process.returncode == 0:
                download_progress[model_id] = {"progress": 100, "status": "completed"}
                # Remove from progress tracking after a delay
                await asyncio.sleep(3)
                if model_id in download_progress:
                    del download_progress[model_id]
            else:
                print(f"Ollama pull failed with return code: {process.returncode}")
                download_progress[model_id] = {"progress": 0, "status": "error"}
                await asyncio.sleep(5)
                if model_id in download_progress:
                    del download_progress[model_id]
                
        except Exception as e:
            print(f"Download error for {model_id}: {e}")
            download_progress[model_id] = {"progress": 0, "status": "error"}
            await asyncio.sleep(5)
            if model_id in download_progress:
                del download_progress[model_id]
    
    # Start download task
    asyncio.create_task(download_task())
    
    return {"message": f"Download started for {model_id}"}

@router.get("/models/download-progress/{model_id}")
async def get_download_progress(model_id: str) -> Dict[str, Any]:
    """Get download progress for a specific model"""
    if model_id not in download_progress:
        # Check if model is already downloaded
        if check_model_downloaded(model_id):
            return {
                "model_id": model_id,
                "progress": 100,
                "status": "completed"
            }
        else:
            raise HTTPException(status_code=404, detail="No download in progress for this model")
    
    progress_data = download_progress[model_id]
    
    return {
        "model_id": model_id,
        "progress": progress_data.get("progress", 0),
        "status": progress_data.get("status", "downloading")
    }

@router.post("/models/set-active")
async def set_active_model(request: ModelSetActiveRequest) -> Dict[str, Any]:
    """Set a model as active"""
    global active_model
    
    model_id = request.model_id
    
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if not check_model_downloaded(model_id):
        raise HTTPException(status_code=400, detail="Model not downloaded")
    
    active_model = model_id
    
    return {"message": f"Model {model_id} set as active"}

@router.delete("/models/{model_id}")
async def delete_model(model_id: str) -> Dict[str, Any]:
    """Delete a downloaded model"""
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if not check_model_downloaded(model_id):
        raise HTTPException(status_code=400, detail="Model not downloaded")
    
    try:
        process = await asyncio.create_subprocess_exec(
            "ollama", "rm", model_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        await process.wait()
        
        if process.returncode == 0:
            # If this was the active model, reset to default
            global active_model
            if active_model == model_id:
                active_model = "qwen2.5:1.5b-instruct"
            
            return {"message": f"Model {model_id} deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete model")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting model: {str(e)}")

@router.get("/models/active")
async def get_active_model() -> Dict[str, Any]:
    """Get the currently active model"""
    return {
        "active_model": active_model,
        "model_name": AVAILABLE_MODELS.get(active_model, {}).get("name", "Unknown")
    }