from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import asyncio
import aiohttp
import os
import subprocess
import shutil
from pydantic import BaseModel
from pathlib import Path

router = APIRouter()

class ModelInfo(BaseModel):
    id: str
    name: str
    downloaded: bool
    downloading: bool = False  # True if download is in progress
    active: bool
    size: str = ""
    gated: bool = False  # Whether model requires HF token

class ModelDownloadRequest(BaseModel):
    model_id: str
    hf_token: Optional[str] = None

class ModelSetActiveRequest(BaseModel):
    model_id: str

class ModelDeleteRequest(BaseModel):
    model_id: str

# Available models configuration
# Optimized for 16GB GPU - only models that fit comfortably
# Sorted alphabetically by display name
AVAILABLE_MODELS = {
    "CohereForAI/aya-expanse-8b": {
        "name": "Aya Expanse 8B (Multilingual)",
        "size": "~12GB",
        "gated": False,
        "local_path": "aya-expanse-8b"
    },
    "meta-llama/Llama-3.2-3B-Instruct": {
        "name": "Llama 3.2 3B Instruct 🔒",
        "size": "~6GB",
        "gated": True,
        "local_path": "Llama-3.2-3B-Instruct"
    },
    "nvidia/Mistral-NeMo-Minitron-8B-Instruct": {
        "name": "Minitron 8B Instruct (NVIDIA)",
        "size": "~12GB",
        "gated": False,
        "local_path": "Mistral-NeMo-Minitron-8B-Instruct"
    },
    "mistralai/Mistral-7B-Instruct-v0.3": {
        "name": "Mistral 7B Instruct v0.3",
        "size": "~14GB",
        "gated": False,
        "local_path": "Mistral-7B-Instruct-v0.3"
    },
    "mistralai/Mistral-Nemo-Instruct-2407": {
        "name": "Mistral Nemo 12B Instruct",
        "size": "~12GB",
        "gated": False,
        "local_path": "Mistral-Nemo-Instruct-2407"
    },
    "microsoft/Phi-3.5-mini-instruct": {
        "name": "Phi 3.5 Mini Instruct (3.8B)",
        "size": "~8GB",
        "gated": False,
        "local_path": "Phi-3.5-mini-instruct"
    },
    "Qwen/Qwen2.5-0.5B-Instruct": {
        "name": "Qwen 2.5 0.5B Instruct",
        "size": "~1GB",
        "gated": False,
        "local_path": "Qwen2.5-0.5B-Instruct"
    },
    "Qwen/Qwen2.5-1.5B-Instruct": {
        "name": "Qwen 2.5 1.5B Instruct",
        "size": "~3GB",
        "gated": False,
        "local_path": "Qwen2.5-1.5B-Instruct"
    },
    "Qwen/Qwen2.5-3B-Instruct": {
        "name": "Qwen 2.5 3B Instruct",
        "size": "~6GB",
        "gated": False,
        "local_path": "Qwen2.5-3B-Instruct"
    },
}

# Path to models directory (go up from backend/app/api/ to project root)
MODELS_DIR = Path(__file__).parent.parent.parent.parent / "models"

# Global state for tracking downloads and active model
download_progress = {}
active_model = None  # Will be detected from filesystem

def check_model_downloaded(model_id: str) -> bool:
    """Check if a model is fully downloaded locally (not just started)."""
    if model_id not in AVAILABLE_MODELS:
        return False
    
    # Check if the model directory exists in the models folder
    local_path = AVAILABLE_MODELS[model_id]["local_path"]
    model_dir = MODELS_DIR / local_path
    
    # Basic check: directory and config must exist
    if not model_dir.exists() or not (model_dir / "config.json").exists():
        return False
    
    # Check for model weight files (.safetensors or .bin)
    safetensors_files = list(model_dir.glob("*.safetensors"))
    bin_files = list(model_dir.glob("*.bin"))
    
    # Model must have at least one weight file
    if not safetensors_files and not bin_files:
        return False
    
    # Check if there's an incomplete download in progress (.cache with .incomplete files)
    cache_dir = model_dir / ".cache" / "huggingface" / "download"
    if cache_dir.exists():
        incomplete_files = list(cache_dir.glob("*.incomplete"))
        if incomplete_files:
            # Download is still in progress
            return False
    
    return True


def check_model_download_in_progress(model_id: str) -> bool:
    """Check if a model download is currently in progress."""
    if model_id not in AVAILABLE_MODELS:
        return False
    
    local_path = AVAILABLE_MODELS[model_id]["local_path"]
    model_dir = MODELS_DIR / local_path
    
    # Check if directory exists but download is incomplete
    if not model_dir.exists():
        return False
    
    # Check for .incomplete files in cache
    cache_dir = model_dir / ".cache" / "huggingface" / "download"
    if cache_dir.exists():
        incomplete_files = list(cache_dir.glob("*.incomplete"))
        if incomplete_files:
            return True
    
    # Check if config exists but no weight files yet
    if (model_dir / "config.json").exists():
        safetensors_files = list(model_dir.glob("*.safetensors"))
        bin_files = list(model_dir.glob("*.bin"))
        if not safetensors_files and not bin_files:
            return True
    
    return False

def get_downloaded_models() -> List[str]:
    """Get list of downloaded models."""
    downloaded = []
    for model_id in AVAILABLE_MODELS.keys():
        if check_model_downloaded(model_id):
            downloaded.append(model_id)
    return downloaded

def get_vllm_serving_model() -> Optional[str]:
    """Check which model vLLM is currently serving by checking the running process."""
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Look for vllm process with --model argument
        for line in result.stdout.split('\n'):
            if 'vllm.entrypoints.openai.api_server' in line and '--model' in line:
                # Extract model path from command line
                parts = line.split('--model')
                if len(parts) > 1:
                    model_part = parts[1].strip().split()[0]
                    # Extract just the model name from the path
                    model_name = model_part.split('/')[-1]
                    
                    # Match against our available models
                    for model_id, config in AVAILABLE_MODELS.items():
                        if config["local_path"] == model_name:
                            return model_id
        return None
    except Exception as e:
        print(f"Error checking vLLM process: {e}")
        return None

@router.get("/")
async def get_models() -> Dict[str, Any]:
    """Get list of available models with their status"""
    global active_model
    
    # Check which model vLLM is actually serving
    vllm_model = get_vllm_serving_model()
    if vllm_model:
        active_model = vllm_model
    elif active_model is None:
        # Fallback: detect from filesystem
        for model_id, config in AVAILABLE_MODELS.items():
            if check_model_downloaded(model_id):
                active_model = model_id
                break
    
    models = []
    downloaded_models = get_downloaded_models()
    
    for model_id, config in AVAILABLE_MODELS.items():
        is_downloaded = model_id in downloaded_models
        is_downloading = check_model_download_in_progress(model_id) or model_id in download_progress
        
        models.append(ModelInfo(
            id=model_id,
            name=config["name"],
            downloaded=is_downloaded,
            downloading=is_downloading,
            active=model_id == active_model,
            size=config["size"],
            gated=config["gated"]
        ))
    
    return {"models": models}

@router.post("/download")
async def download_model(request: ModelDownloadRequest) -> Dict[str, Any]:
    """Download a model from HuggingFace"""
    model_id = request.model_id
    
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if model_id in download_progress:
        raise HTTPException(status_code=400, detail="Model download already in progress")
    
    # Check if model requires token
    if AVAILABLE_MODELS[model_id]["gated"] and not request.hf_token:
        raise HTTPException(status_code=400, detail="This model requires a HuggingFace token")
    
    # Start download in background
    download_progress[model_id] = {"progress": 0, "status": "downloading"}
    
    async def download_task():
        try:
            # Create models directory if it doesn't exist
            MODELS_DIR.mkdir(parents=True, exist_ok=True)
            
            local_path = AVAILABLE_MODELS[model_id]["local_path"]
            target_dir = MODELS_DIR / local_path
            
            download_progress[model_id] = {"progress": 5, "status": "downloading"}
            
            # Build huggingface-cli command
            cmd = [
                "huggingface-cli",
                "download",
                model_id,
                "--local-dir", str(target_dir),
                "--local-dir-use-symlinks", "False"
            ]
            
            # Add token if provided
            if request.hf_token:
                cmd.extend(["--token", request.hf_token])
            
            print(f"Starting download: {' '.join(cmd[:4])}...")  # Don't log token
            
            # Start the download process
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT  # Merge stderr into stdout
            )
            
            # Track progress by counting files
            files_to_download = 0
            files_downloaded = 0
            download_progress[model_id] = {"progress": 5, "status": "downloading"}
            
            # Read output line by line
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                    
                line_text = line.decode('utf-8', errors='ignore').strip()
                if not line_text:
                    continue
                
                # Log the output for debugging
                print(f"[{model_id}] {line_text}")
                
                # Count files to download
                if "Fetching" in line_text or "files to be fetched" in line_text:
                    # Try to extract number of files
                    import re
                    match = re.search(r'(\d+)\s+file', line_text)
                    if match:
                        files_to_download = int(match.group(1))
                        print(f"Total files to download: {files_to_download}")
                
                # Count downloaded files
                if "(…)" in line_text or "100%" in line_text or line_text.endswith(".safetensors") or line_text.endswith(".bin"):
                    files_downloaded += 1
                    if files_to_download > 0:
                        progress_pct = min(90, int((files_downloaded / files_to_download) * 90))
                        download_progress[model_id] = {"progress": progress_pct, "status": "downloading"}
                        print(f"Progress: {files_downloaded}/{files_to_download} files ({progress_pct}%)")
                    else:
                        # Estimate progress based on files downloaded
                        progress_pct = min(85, 10 + (files_downloaded * 10))
                        download_progress[model_id] = {"progress": progress_pct, "status": "downloading"}
                        print(f"Progress estimate: {progress_pct}%")
            
            # Wait for process to complete
            await process.wait()
            
            if process.returncode == 0:
                # Verify download completed by checking for model files
                if check_model_downloaded(model_id):
                    download_progress[model_id] = {"progress": 100, "status": "completed"}
                    print(f"Download completed successfully for {model_id}")
                    
                    # Clean up .cache directory
                    cache_dir = target_dir / ".cache"
                    if cache_dir.exists():
                        print(f"Removing cache directory: {cache_dir}")
                        shutil.rmtree(cache_dir, ignore_errors=True)
                else:
                    download_progress[model_id] = {"progress": 0, "status": "error", "message": "Download completed but model files not found"}
                    print(f"Download verification failed for {model_id}")
                
                # Remove from progress tracking after a delay
                await asyncio.sleep(3)
                if model_id in download_progress:
                    del download_progress[model_id]
            else:
                error_msg = "Download process failed"
                print(f"Download failed for {model_id}: return code {process.returncode}")
                download_progress[model_id] = {"progress": 0, "status": "error", "message": error_msg}
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

@router.get("/download-progress/{model_id:path}")
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

@router.post("/set-active")
async def set_active_model(request: ModelSetActiveRequest) -> Dict[str, Any]:
    """Set a model as active and restart vLLM"""
    global active_model
    
    model_id = request.model_id
    
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    # Check if download is in progress
    if check_model_download_in_progress(model_id) or model_id in download_progress:
        raise HTTPException(
            status_code=400, 
            detail="Model download is still in progress. Please wait for it to complete."
        )
    
    if not check_model_downloaded(model_id):
        raise HTTPException(
            status_code=400, 
            detail="Model is not fully downloaded. Please download it first."
        )
    
    # Update active model
    old_model = active_model
    active_model = model_id
    
    # Restart vLLM with the new model
    try:
        local_path = AVAILABLE_MODELS[model_id]["local_path"]
        model_path = MODELS_DIR / local_path
        
        # Kill existing vLLM processes
        print(f"Stopping vLLM for model switch from {old_model} to {model_id}...")
        stop_cmd = ["pkill", "-f", "vllm.entrypoints.openai.api_server"]
        subprocess.run(stop_cmd, check=False)
        
        # Wait for process to stop
        await asyncio.sleep(3)
        
        # Start vLLM with new model
        print(f"Starting vLLM with model: {model_path}")
        
        # Get the project root and venv python path
        project_root = Path(__file__).parent.parent.parent.parent
        venv_python = project_root / "backend" / ".venv" / "bin" / "python"
        
        # Log file for vLLM output
        log_file = project_root / "vllm.log"
        
        vllm_cmd = [
            str(venv_python), "-m", "vllm.entrypoints.openai.api_server",
            "--model", str(model_path),
            "--port", "8001",
            "--max-model-len", "8192",
            "--dtype", "auto",
            "--api-key", "dummy"
        ]
        
        print(f"vLLM command: {' '.join(vllm_cmd)}")
        
        # Start in background with logging
        with open(log_file, "w") as f:
            subprocess.Popen(
                vllm_cmd,
                stdout=f,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                cwd=str(project_root)
            )
        
        print(f"vLLM process started, logging to {log_file}")
        
        # Start background task to wait for vLLM (don't block the response)
        asyncio.create_task(_wait_for_vllm(model_id))
        
        # Return immediately - the frontend will poll or retry
        return {
            "status": "loading",
            "message": f"Model {model_id} is being loaded. This may take 30-120 seconds for large models.",
            "model_name": AVAILABLE_MODELS[model_id]["name"]
        }
        
    except Exception as e:
        # Rollback on error
        active_model = old_model
        print(f"Error restarting vLLM: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to restart vLLM: {str(e)}")


async def _wait_for_vllm(model_id: str):
    """Background task to wait for vLLM to be ready (for logging purposes)."""
    import aiohttp
    max_wait = 180
    poll_interval = 5
    waited = 0
    
    print(f"Background: Waiting for vLLM to load {model_id}...")
    
    while waited < max_wait:
        await asyncio.sleep(poll_interval)
        waited += poll_interval
        
        try:
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": "Bearer dummy"}
                async with session.get(
                    "http://localhost:8001/v1/models", 
                    timeout=aiohttp.ClientTimeout(total=5),
                    headers=headers
                ) as resp:
                    if resp.status == 200:
                        print(f"Background: vLLM ready after {waited} seconds for {model_id}")
                        return
        except Exception:
            print(f"Background: Still waiting for vLLM... ({waited}s)")
            continue
    
    print(f"Background: vLLM did not respond within {max_wait} seconds for {model_id}")

@router.post("/delete")
async def delete_model(request: ModelDeleteRequest) -> Dict[str, Any]:
    """Delete a downloaded model"""
    model_id = request.model_id
    
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Model not available")
    
    if not check_model_downloaded(model_id):
        raise HTTPException(status_code=400, detail="Model not downloaded")
    
    try:
        local_path = AVAILABLE_MODELS[model_id]["local_path"]
        model_dir = MODELS_DIR / local_path
        
        print(f"Permanently deleting model directory: {model_dir}")
        
        # Function to handle removal errors (make files writable if needed)
        def handle_remove_error(func, path, exc_info):
            """Error handler for shutil.rmtree to handle permission issues"""
            import stat
            if not os.access(path, os.W_OK):
                os.chmod(path, stat.S_IWUSR)
                func(path)
            else:
                raise
        
        # Delete the model directory completely (bypass trash)
        shutil.rmtree(model_dir, onerror=handle_remove_error)
        print(f"Model {model_id} deleted successfully")
        
        # Also clean up any cache directories in other models
        for cache_dir in MODELS_DIR.glob("*/.cache"):
            if cache_dir.exists():
                print(f"Removing cache directory: {cache_dir}")
                shutil.rmtree(cache_dir, ignore_errors=True)
        
        # If this was the active model, reset to None
        global active_model
        if active_model == model_id:
            active_model = None
            # Set another downloaded model as active if available
            for mid in AVAILABLE_MODELS.keys():
                if check_model_downloaded(mid):
                    active_model = mid
                    break
        
        return {"message": f"Model {model_id} deleted successfully"}
            
    except Exception as e:
        print(f"Error deleting model: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting model: {str(e)}")


@router.get("/vllm-status")
async def get_vllm_status() -> Dict[str, Any]:
    """Check if vLLM is ready to serve requests"""
    try:
        async with aiohttp.ClientSession() as session:
            headers = {"Authorization": "Bearer dummy"}
            async with session.get(
                "http://localhost:8001/v1/models", 
                timeout=aiohttp.ClientTimeout(total=3),
                headers=headers
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {
                        "status": "ready",
                        "models": data.get("data", [])
                    }
                else:
                    return {"status": "loading"}
    except Exception:
        return {"status": "loading"}


@router.get("/active")
async def get_active_model() -> Dict[str, Any]:
    """Get the currently active model"""
    global active_model
    
    # Auto-detect if not set
    if active_model is None:
        for model_id in AVAILABLE_MODELS.keys():
            if check_model_downloaded(model_id):
                active_model = model_id
                break
    
    if active_model is None:
        return {
            "active_model": None,
            "model_name": "No model active"
        }
    
    return {
        "active_model": active_model,
        "model_name": AVAILABLE_MODELS[active_model]["name"]
    }