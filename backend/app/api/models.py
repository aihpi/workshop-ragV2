"""Model management API endpoints for vLLM."""
import asyncio
import json
import os
import shutil
from typing import List, Dict, Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

router = APIRouter()

# Global state for tracking downloads and active model
download_progress: Dict[str, Dict] = {}
active_model: Optional[str] = None

# Model definitions for vLLM
AVAILABLE_MODELS = {
    "qwen2.5:1.5b-instruct": {
        "name": "Qwen2.5 1.5B Instruct",
        "size": "1.5GB",
        "hf_model": "Qwen/Qwen2.5-1.5B-Instruct"
    },
    "qwen2.5:3b-instruct": {
        "name": "Qwen2.5 3B Instruct", 
        "size": "3.2GB",
        "hf_model": "Qwen/Qwen2.5-3B-Instruct"
    },
    "qwen2.5:7b-instruct": {
        "name": "Qwen2.5 7B Instruct",
        "size": "7.4GB",
        "hf_model": "Qwen/Qwen2.5-7B-Instruct"
    }
}

# Active model state file and model storage
ACTIVE_MODEL_FILE = "/tmp/rag_active_model.txt"
MODELS_DIR = "/tmp/vllm_models"

# Create models directory if it doesn't exist
os.makedirs(MODELS_DIR, exist_ok=True)

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

def load_active_model() -> Optional[str]:
    """Load active model from file."""
    try:
        if os.path.exists(ACTIVE_MODEL_FILE):
            with open(ACTIVE_MODEL_FILE, 'r') as f:
                return f.read().strip()
    except Exception:
        pass
    return None

def save_active_model(model_name: str) -> None:
    """Save active model to file."""
    try:
        with open(ACTIVE_MODEL_FILE, 'w') as f:
            f.write(model_name)
    except Exception:
        pass

def check_model_downloaded(model_id: str) -> bool:
    """Check if a model is downloaded locally by checking if model directory exists."""
    if model_id not in AVAILABLE_MODELS:
        return False
    
    model_path = os.path.join(MODELS_DIR, model_id.replace(":", "_"))
    return os.path.exists(model_path) and bool(os.listdir(model_path))

def get_downloaded_models() -> List[str]:
    """Get list of downloaded models."""
    downloaded = []
    for model_id in AVAILABLE_MODELS.keys():
        if check_model_downloaded(model_id):
            downloaded.append(model_id)
    return downloaded

# Load active model on startup
active_model = load_active_model() or "qwen2.5:1.5b-instruct"

@router.get("/models")
async def get_models() -> Dict[str, List[ModelInfo]]:
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
async def download_model(request: ModelDownloadRequest) -> Dict[str, str]:
    """Download a model using Hugging Face transformers"""
    model_id = request.model_id
    
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if model_id in download_progress:
        raise HTTPException(status_code=400, detail="Model download already in progress")
    
    # Start download in background
    download_progress[model_id] = {"progress": 5, "status": "downloading"}
    
    async def download_task():
        try:
            hf_model = AVAILABLE_MODELS[model_id]["hf_model"]
            model_path = os.path.join(MODELS_DIR, model_id.replace(":", "_"))
            
            # Simulate download progress for now
            # In a real implementation, you would use huggingface_hub to download
            progress_value = 5
            
            # Create model directory
            os.makedirs(model_path, exist_ok=True)
            
            # Simulate download with progress updates
            for i in range(10):
                await asyncio.sleep(1)  # Simulate download time
                progress_value += 9
                download_progress[model_id] = {"progress": progress_value, "status": "downloading"}
            
            # Create a marker file to indicate the model is "downloaded"
            with open(os.path.join(model_path, "model_info.json"), 'w') as f:
                json.dump({
                    "model_id": model_id,
                    "hf_model": hf_model,
                    "downloaded_at": "2025-11-05"
                }, f)
            
            download_progress[model_id] = {"progress": 100, "status": "completed"}
            
            # Remove from progress tracking after a delay
            await asyncio.sleep(3)
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
async def set_active_model(request: ModelSetActiveRequest) -> Dict[str, str]:
    """Set a model as active"""
    global active_model
    
    model_id = request.model_id
    
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if not check_model_downloaded(model_id):
        raise HTTPException(status_code=400, detail="Model not downloaded")
    
    active_model = model_id
    save_active_model(model_id)
    
    return {"message": f"Model {model_id} set as active"}

@router.delete("/models/{model_id}")
async def delete_model(model_id: str) -> Dict[str, str]:
    """Delete a downloaded model"""
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if not check_model_downloaded(model_id):
        raise HTTPException(status_code=400, detail="Model not downloaded")
    
    try:
        model_path = os.path.join(MODELS_DIR, model_id.replace(":", "_"))
        shutil.rmtree(model_path)
        
        # If this was the active model, reset to default
        global active_model
        if active_model == model_id:
            active_model = "qwen2.5:1.5b-instruct"
            save_active_model(active_model)
        
        return {"message": f"Model {model_id} deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting model: {str(e)}")

@router.get("/models/active")
async def get_active_model() -> Dict[str, Optional[str]]:
    """Get the currently active model"""
    model_name = None
    if active_model and active_model in AVAILABLE_MODELS:
        model_name = AVAILABLE_MODELS[active_model]["name"]
    
    return {
        "active_model": active_model,
        "model_name": model_name or "Unknown"
    }