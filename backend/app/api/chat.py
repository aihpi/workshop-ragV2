"""Chat history API routes."""
from fastapi import APIRouter, HTTPException
from typing import List, Dict

from app.services import ChatHistoryManager
from app.core.config import settings

router = APIRouter()

# Initialize chat manager
chat_manager = ChatHistoryManager(history_folder=settings.CHAT_HISTORY_FOLDER)


@router.post("/new")
async def create_session() -> Dict[str, str]:
    """Create a new chat session.
    
    Returns:
        Session ID
    """
    try:
        session_id = chat_manager.create_session()
        return {"session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")


@router.get("/list")
async def list_sessions() -> Dict[str, List[Dict]]:
    """List all chat sessions.
    
    Returns:
        List of sessions
    """
    try:
        sessions = chat_manager.list_sessions()
        return {"sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing sessions: {str(e)}")


@router.get("/{session_id}")
async def get_session_history(session_id: str) -> Dict[str, List[Dict]]:
    """Get chat history for a session.
    
    Args:
        session_id: Chat session ID
        
    Returns:
        Chat history
    """
    try:
        if not chat_manager.session_exists(session_id):
            raise HTTPException(status_code=404, detail="Session not found")
        
        history = chat_manager.get_history(session_id)
        return {"history": history}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting history: {str(e)}")


@router.delete("/{session_id}")
async def delete_session(session_id: str) -> Dict[str, bool]:
    """Delete a chat session.
    
    Args:
        session_id: Chat session ID
        
    Returns:
        Success status
    """
    try:
        if not chat_manager.session_exists(session_id):
            raise HTTPException(status_code=404, detail="Session not found")
        
        chat_manager.delete_session(session_id)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")
