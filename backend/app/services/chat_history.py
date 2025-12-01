"""Chat history management service with versioned node structure."""
import json
import os
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import uuid


class ChatHistoryManager:
    """Manages chat history persistence with versioned node-based structure.
    
    Chat structure:
    {
        "chat_id": "...",
        "created_at": "...",
        "updated_at": "...",
        "versions": [
            {
                "version_id": "v1",
                "branched_from": null,  # or node_id if branched
                "nodes": [
                    {"node_id": "q1", "type": "query", "content": "...", "timestamp": "..."},
                    {"node_id": "r1", "type": "response", "parent": "q1", "content": "...", "chunks": [...], "timestamp": "..."},
                    ...
                ]
            },
            ...
        ]
    }
    """
    
    def __init__(self, history_folder: str):
        """Initialize chat history manager.
        
        Args:
            history_folder: Path to folder for storing chat histories
        """
        self.history_folder = Path(history_folder)
        self.history_folder.mkdir(parents=True, exist_ok=True)
    
    def _migrate_old_format(self, session_data: Dict) -> Dict:
        """Migrate old message format to new versioned node structure.
        
        Args:
            session_data: Old format session data
            
        Returns:
            Migrated session data in new format
        """
        # Check if already in new format
        if "versions" in session_data:
            return session_data
        
        # Migrate from old format
        chat_id = session_data.get("session_id", str(uuid.uuid4()))
        created_at = session_data.get("created_at", datetime.now().isoformat())
        old_messages = session_data.get("messages", [])
        
        nodes = []
        node_counter = 1
        
        for msg in old_messages:
            timestamp = msg.get("timestamp", datetime.now().isoformat())
            
            # Create query node
            query_node_id = f"q{node_counter}"
            parent_id = f"r{node_counter - 1}" if node_counter > 1 else None
            
            query_node = {
                "node_id": query_node_id,
                "type": "query",
                "content": msg.get("query", ""),
                "timestamp": timestamp,
            }
            if parent_id:
                query_node["parent"] = parent_id
            nodes.append(query_node)
            
            # Create response node
            response_node_id = f"r{node_counter}"
            response_node = {
                "node_id": response_node_id,
                "type": "response",
                "parent": query_node_id,
                "content": msg.get("answer", ""),
                "chunks": msg.get("chunks", []),
                "timestamp": timestamp,
            }
            nodes.append(response_node)
            
            node_counter += 1
        
        return {
            "chat_id": chat_id,
            "created_at": created_at,
            "updated_at": datetime.now().isoformat(),
            "versions": [
                {
                    "version_id": "v1",
                    "branched_from": None,
                    "nodes": nodes
                }
            ] if nodes else []
        }
    
    def _load_session(self, session_id: str) -> Dict:
        """Load and migrate session data.
        
        Args:
            session_id: Session ID
            
        Returns:
            Session data in new format
        """
        session_file = self.history_folder / f"{session_id}.json"
        
        if not session_file.exists():
            raise ValueError(f"Session {session_id} not found")
        
        with open(session_file, "r") as f:
            session_data = json.load(f)
        
        # Migrate if needed
        migrated = self._migrate_old_format(session_data)
        
        # Save migrated format if it changed
        if "versions" not in session_data:
            with open(session_file, "w") as f:
                json.dump(migrated, f, indent=2)
        
        return migrated
    
    def _save_session(self, session_id: str, session_data: Dict):
        """Save session data.
        
        Args:
            session_id: Session ID
            session_data: Session data
        """
        session_file = self.history_folder / f"{session_id}.json"
        session_data["updated_at"] = datetime.now().isoformat()
        
        with open(session_file, "w") as f:
            json.dump(session_data, f, indent=2)
    
    def _get_next_node_ids(self, nodes: List[Dict]) -> Tuple[int, int]:
        """Get next query and response node numbers.
        
        Args:
            nodes: Existing nodes
            
        Returns:
            Tuple of (next_query_num, next_response_num)
        """
        max_q = 0
        max_r = 0
        for node in nodes:
            node_id = node.get("node_id", "")
            if node_id.startswith("q"):
                try:
                    num = int(node_id[1:].split("_")[0])  # Handle q1, q1_v2, etc.
                    max_q = max(max_q, num)
                except ValueError:
                    pass
            elif node_id.startswith("r"):
                try:
                    num = int(node_id[1:].split("_")[0])
                    max_r = max(max_r, num)
                except ValueError:
                    pass
        return max_q + 1, max_r + 1
    
    def create_session(self) -> str:
        """Create a new chat session.
        
        Returns:
            Session ID
        """
        session_id = str(uuid.uuid4())
        session_file = self.history_folder / f"{session_id}.json"
        
        session_data = {
            "chat_id": session_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "versions": []
        }
        
        with open(session_file, "w") as f:
            json.dump(session_data, f, indent=2)
        
        return session_id
    
    def add_message(self, session_id: str, query: str, answer: str, chunks: List[Dict], 
                    versions: Optional[List[str]] = None, 
                    versions_chunks: Optional[List[List[Dict]]] = None,
                    messages_per_version: Optional[List[List[Dict]]] = None,
                    version_id: Optional[str] = None):
        """Add a message (query + response) to chat history.
        
        Args:
            session_id: Chat session ID
            query: User query
            answer: Assistant answer
            chunks: Retrieved chunks
            versions: List of response versions (for UI compatibility)
            versions_chunks: Chunks for each version (for UI compatibility)
            messages_per_version: Complete message list after each version (for UI compatibility)
            version_id: Specific version to add to (default: current/latest version)
        """
        session_data = self._load_session(session_id)
        timestamp = datetime.now().isoformat()
        
        # Get or create the target version
        if not session_data["versions"]:
            # Create first version
            session_data["versions"].append({
                "version_id": "v1",
                "branched_from": None,
                "nodes": []
            })
        
        # Find target version (default to last one)
        target_version = None
        if version_id:
            for v in session_data["versions"]:
                if v["version_id"] == version_id:
                    target_version = v
                    break
        if not target_version:
            target_version = session_data["versions"][-1]
        
        # Get next node IDs
        next_q, next_r = self._get_next_node_ids(target_version["nodes"])
        
        # Find parent (last response in this version)
        parent_id = None
        for node in reversed(target_version["nodes"]):
            if node["type"] == "response":
                parent_id = node["node_id"]
                break
        
        # Create query node
        query_node_id = f"q{next_q}"
        query_node = {
            "node_id": query_node_id,
            "type": "query",
            "content": query,
            "timestamp": timestamp,
        }
        if parent_id:
            query_node["parent"] = parent_id
        target_version["nodes"].append(query_node)
        
        # Create response node
        response_node_id = f"r{next_r}"
        response_node = {
            "node_id": response_node_id,
            "type": "response",
            "parent": query_node_id,
            "content": answer,
            "chunks": chunks,
            "timestamp": timestamp,
        }
        target_version["nodes"].append(response_node)
        
        self._save_session(session_id, session_data)
    
    def create_branch(self, session_id: str, branch_from_node_id: str) -> str:
        """Create a new version branching from a specific node.
        
        Args:
            session_id: Chat session ID
            branch_from_node_id: Node ID to branch from (typically a query node)
            
        Returns:
            New version ID
        """
        session_data = self._load_session(session_id)
        
        # Find the source version and node
        source_version = None
        source_node = None
        for version in session_data["versions"]:
            for node in version["nodes"]:
                if node["node_id"] == branch_from_node_id:
                    source_version = version
                    source_node = node
                    break
            if source_node:
                break
        
        if not source_node:
            raise ValueError(f"Node {branch_from_node_id} not found")
        
        # Create new version ID
        version_num = len(session_data["versions"]) + 1
        new_version_id = f"v{version_num}"
        
        # Copy nodes up to (and including) the branch point
        new_nodes = []
        for node in source_version["nodes"]:
            new_nodes.append(node.copy())
            if node["node_id"] == branch_from_node_id:
                break
        
        # Create new version
        new_version = {
            "version_id": new_version_id,
            "branched_from": branch_from_node_id,
            "nodes": new_nodes
        }
        session_data["versions"].append(new_version)
        
        self._save_session(session_id, session_data)
        return new_version_id
    
    def add_response_version(self, session_id: str, query_node_id: str, 
                             answer: str, chunks: List[Dict]) -> str:
        """Add an alternative response to a query (creates a new branch).
        
        Args:
            session_id: Chat session ID
            query_node_id: The query node to respond to
            answer: New response content
            chunks: Retrieved chunks for this response
            
        Returns:
            New version ID
        """
        session_data = self._load_session(session_id)
        timestamp = datetime.now().isoformat()
        
        # Find the query node's version
        source_version = None
        for version in session_data["versions"]:
            for node in version["nodes"]:
                if node["node_id"] == query_node_id:
                    source_version = version
                    break
            if source_version:
                break
        
        if not source_version:
            raise ValueError(f"Query node {query_node_id} not found")
        
        # Create new version branching from the query
        version_num = len(session_data["versions"]) + 1
        new_version_id = f"v{version_num}"
        
        # Copy nodes up to and including the query
        new_nodes = []
        for node in source_version["nodes"]:
            new_nodes.append(node.copy())
            if node["node_id"] == query_node_id:
                break
        
        # Add the new response with a unique ID
        response_node_id = f"r{query_node_id[1:]}_v{version_num}"  # e.g., r1_v2
        response_node = {
            "node_id": response_node_id,
            "type": "response",
            "parent": query_node_id,
            "content": answer,
            "chunks": chunks,
            "timestamp": timestamp,
        }
        new_nodes.append(response_node)
        
        new_version = {
            "version_id": new_version_id,
            "branched_from": query_node_id,
            "nodes": new_nodes
        }
        session_data["versions"].append(new_version)
        
        self._save_session(session_id, session_data)
        return new_version_id
    
    def update_message(self, session_id: str, message_index: int, 
                      versions: Optional[List[str]] = None,
                      versions_chunks: Optional[List[List[Dict]]] = None,
                      messages_per_version: Optional[List[List[Dict]]] = None):
        """Update a message with version information (UI compatibility layer).
        
        This method maintains backward compatibility with the frontend's
        version tracking approach.
        
        Args:
            session_id: Chat session ID
            message_index: Index of the message to update (0-based)
            versions: List of response versions
            versions_chunks: Chunks for each version
            messages_per_version: Complete message list after each version
        """
        session_data = self._load_session(session_id)
        
        if not session_data["versions"]:
            return
        
        # Find the response node at this index in the first version
        current_version = session_data["versions"][0]
        response_nodes = [n for n in current_version["nodes"] if n["type"] == "response"]
        
        if message_index >= len(response_nodes):
            raise ValueError(f"Message index {message_index} out of range")
        
        target_response = response_nodes[message_index]
        query_node_id = target_response.get("parent")
        
        # Create new versions for each response variant (if not already exists)
        if versions and len(versions) > len(session_data["versions"]):
            for i, version_content in enumerate(versions):
                if i == 0:
                    # First version is already the main one - just update it
                    target_response["content"] = version_content
                    if versions_chunks and i < len(versions_chunks):
                        target_response["chunks"] = versions_chunks[i]
                else:
                    # Check if this version already exists
                    if i < len(session_data["versions"]):
                        continue
                    
                    # Create a new version branch
                    chunks = versions_chunks[i] if versions_chunks and i < len(versions_chunks) else []
                    self.add_response_version(session_id, query_node_id, version_content, chunks)
                    # Reload session data after adding version
                    session_data = self._load_session(session_id)
        
        self._save_session(session_id, session_data)
    
    def get_history(self, session_id: str, max_messages: int = 10, 
                    version_id: Optional[str] = None) -> List[Dict]:
        """Get chat history for a session (in legacy format for compatibility).
        
        This method returns messages from a specific version (default: first/main version)
        and includes version information for queries that have multiple response versions.
        
        For each query with multiple versions:
        - versions: list of all response texts
        - versions_chunks: list of chunks for each version
        - messages_per_version: subsequent messages after each version's response
        
        Example: Initial chat Q1→R1→Q2→R2, then regenerate R1 to get R1b
        - v1 nodes: Q1→R1→Q2→R2
        - v2 nodes: Q1→R1b
        
        When loading, for Q1's message:
        - versions: [R1, R1b]
        - messages_per_version: [[Q2,R2], []]  (v1 has subsequent, v2 doesn't)
        
        Args:
            session_id: Chat session ID
            max_messages: Maximum number of messages to return
            version_id: Specific version to get (default: first/main version)
            
        Returns:
            List of messages in legacy format with version information
        """
        session_data = self._load_session(session_id)
        
        if not session_data["versions"]:
            return []
        
        # Default to first (main) version for consistency
        target_version = session_data["versions"][0]
        if version_id:
            for v in session_data["versions"]:
                if v["version_id"] == version_id:
                    target_version = v
                    break
        
        # Build a map of query_node_id -> list of version info
        # Each entry: (version_id, version_index, response_content, chunks, subsequent_messages)
        query_versions_map: Dict[str, List[Dict]] = {}
        
        for version_idx, version in enumerate(session_data["versions"]):
            nodes = version["nodes"]
            
            # Find all query-response pairs in this version
            i = 0
            while i < len(nodes):
                if nodes[i]["type"] == "query":
                    query_node = nodes[i]
                    query_node_id = query_node["node_id"]
                    
                    # Find the corresponding response
                    response_node = None
                    if i + 1 < len(nodes) and nodes[i + 1]["type"] == "response":
                        response_node = nodes[i + 1]
                    
                    if response_node:
                        # Collect subsequent messages (Q&R pairs after this response)
                        subsequent_messages = []
                        j = i + 2  # Start after the response
                        while j < len(nodes):
                            if nodes[j]["type"] == "query":
                                sub_query = nodes[j]
                                sub_response = None
                                if j + 1 < len(nodes) and nodes[j + 1]["type"] == "response":
                                    sub_response = nodes[j + 1]
                                    j += 2
                                else:
                                    j += 1
                                
                                subsequent_messages.append({
                                    "query": sub_query["content"],
                                    "answer": sub_response["content"] if sub_response else "",
                                    "chunks": sub_response.get("chunks", []) if sub_response else [],
                                    "timestamp": sub_query.get("timestamp", ""),
                                })
                            else:
                                j += 1
                        
                        # Add to the map
                        if query_node_id not in query_versions_map:
                            query_versions_map[query_node_id] = []
                        
                        query_versions_map[query_node_id].append({
                            "version_id": version["version_id"],
                            "version_index": version_idx,
                            "response_content": response_node["content"],
                            "chunks": response_node.get("chunks", []),
                            "subsequent_messages": subsequent_messages,
                        })
                    
                    i += 2 if response_node else i + 1
                else:
                    i += 1
        
        # Convert target version nodes to legacy message format
        messages = []
        nodes = target_version["nodes"]
        
        i = 0
        while i < len(nodes):
            if nodes[i]["type"] == "query":
                query_node = nodes[i]
                query_node_id = query_node["node_id"]
                response_node = None
                
                # Find the corresponding response
                if i + 1 < len(nodes) and nodes[i + 1]["type"] == "response":
                    response_node = nodes[i + 1]
                    i += 2
                else:
                    i += 1
                
                message = {
                    "query": query_node["content"],
                    "answer": response_node["content"] if response_node else "",
                    "chunks": response_node.get("chunks", []) if response_node else [],
                    "timestamp": query_node.get("timestamp", ""),
                }
                
                # Add version information if there are multiple versions for this query
                all_versions = query_versions_map.get(query_node_id, [])
                if len(all_versions) > 1:
                    # Sort by version_index to maintain order
                    all_versions.sort(key=lambda x: x["version_index"])
                    
                    message["versions"] = [v["response_content"] for v in all_versions]
                    message["versions_chunks"] = [v["chunks"] for v in all_versions]
                    message["messages_per_version"] = [v["subsequent_messages"] for v in all_versions]
                
                messages.append(message)
            else:
                i += 1
        
        return messages[-max_messages:]
    
    def get_full_history(self, session_id: str) -> Dict:
        """Get the full chat history with all versions and nodes.
        
        Args:
            session_id: Chat session ID
            
        Returns:
            Complete session data with versions and nodes
        """
        return self._load_session(session_id)
    
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
                
                # Handle both old and new formats
                chat_id = session_data.get("chat_id") or session_data.get("session_id", session_file.stem)
                created_at = session_data.get("created_at", "")
                
                # Get first query
                first_query = None
                num_messages = 0
                
                if "versions" in session_data and session_data["versions"]:
                    # New format
                    nodes = session_data["versions"][0].get("nodes", [])
                    for node in nodes:
                        if node["type"] == "query":
                            if first_query is None:
                                first_query = node.get("content", "")
                            num_messages += 1
                elif "messages" in session_data:
                    # Old format
                    messages = session_data["messages"]
                    num_messages = len(messages)
                    if messages:
                        first_query = messages[0].get("query", "")
                
                sessions.append({
                    "session_id": chat_id,
                    "created_at": created_at,
                    "num_messages": num_messages,
                    "first_query": first_query,
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
    
    def get_version_list(self, session_id: str) -> List[Dict]:
        """Get list of versions for a session.
        
        Args:
            session_id: Chat session ID
            
        Returns:
            List of version summaries
        """
        session_data = self._load_session(session_id)
        
        result = []
        for version in session_data.get("versions", []):
            result.append({
                "version_id": version["version_id"],
                "branched_from": version.get("branched_from"),
                "num_nodes": len(version.get("nodes", [])),
            })
        
        return result
