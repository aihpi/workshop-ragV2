"""Chat history management service."""
import json
import os
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import uuid


class ChatHistoryManager:
    """Manages chat history persistence."""
    
    def __init__(self, history_folder: str):
        """Initialize chat history manager.
        
        Args:
            history_folder: Path to folder for storing chat histories
        """
        self.history_folder = Path(history_folder)
        self.history_folder.mkdir(parents=True, exist_ok=True)
    
    def create_session(self) -> str:
        """Create a new chat session.
        
        Returns:
            Session ID
        """
        session_id = str(uuid.uuid4())
        session_file = self.history_folder / f"{session_id}.json"
        
        session_data = {
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
            "messages": [],
        }
        
        with open(session_file, "w") as f:
            json.dump(session_data, f, indent=2)
        
        return session_id
    
    def add_message(self, session_id: str, query: str, answer: str, chunks: List[Dict]):
        """Add a message to chat history.
        
        Args:
            session_id: Chat session ID
            query: User query
            answer: Assistant answer
            chunks: Retrieved chunks
        """
        session_file = self.history_folder / f"{session_id}.json"
        
        if not session_file.exists():
            raise ValueError(f"Session {session_id} not found")
        
        with open(session_file, "r") as f:
            session_data = json.load(f)
        
        message = {
            "timestamp": datetime.now().isoformat(),
            "query": query,
            "answer": answer,
            "chunks": chunks,
        }
        
        session_data["messages"].append(message)
        
        with open(session_file, "w") as f:
            json.dump(session_data, f, indent=2)
    
    def get_history(self, session_id: str, max_messages: int = 10) -> List[Dict]:
        """Get chat history for a session.
        
        Args:
            session_id: Chat session ID
            max_messages: Maximum number of messages to return
            
        Returns:
            List of messages
        """
        session_file = self.history_folder / f"{session_id}.json"
        
        if not session_file.exists():
            return []
        
        with open(session_file, "r") as f:
            session_data = json.load(f)
        
        return session_data["messages"][-max_messages:]
    
    def list_sessions(self) -> List[Dict]:
        """List all chat sessions.
        
        Returns:
            List of session metadata
        """
        sessions = []
        for session_file in self.history_folder.glob("*.json"):
            try:
                with open(session_file, "r") as f:
                    session_data = json.load(f)
                sessions.append({
                    "session_id": session_data["session_id"],
                    "created_at": session_data["created_at"],
                    "num_messages": len(session_data["messages"]),
                })
            except (json.JSONDecodeError, KeyError):
                continue
        
        return sorted(sessions, key=lambda x: x["created_at"], reverse=True)
    
    def delete_session(self, session_id: str):
        """Delete a chat session.
        
        Args:
            session_id: Chat session ID
        """
        session_file = self.history_folder / f"{session_id}.json"
        if session_file.exists():
            session_file.unlink()
    
    def session_exists(self, session_id: str) -> bool:
        """Check if session exists.
        
        Args:
            session_id: Chat session ID
            
        Returns:
            True if session exists
        """
        session_file = self.history_folder / f"{session_id}.json"
        return session_file.exists()
