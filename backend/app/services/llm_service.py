"""LLM service using vLLM."""
import httpx
from typing import AsyncGenerator, Optional, List, Dict
from app.core.config import settings


class LLMService:
    """Service for interacting with vLLM inference server."""
    
    def __init__(self):
        """Initialize LLM service."""
        self.base_url = f"http://{settings.VLLM_HOST}:{settings.VLLM_PORT}"
        self.model = settings.LLM_MODEL
    
    def create_prompt(
        self,
        query: str,
        context_chunks: List[str],
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Create prompt for LLM.
        
        Args:
            query: User query
            context_chunks: Retrieved context chunks
            chat_history: Optional chat history
            
        Returns:
            Formatted prompt
        """
        context = "\n\n".join([f"Document {i+1}:\n{chunk}" for i, chunk in enumerate(context_chunks)])
        
        if chat_history and len(chat_history) > 0:
            # Prompt with chat history
            history_text = "\n".join([
                f"User: {msg['query']}\nAssistant: {msg['answer']}"
                for msg in chat_history[-settings.MAX_CHAT_HISTORY:]
            ])
            
            prompt = f"""You are a helpful AI assistant that answers questions based on provided documents and conversation history.

Previous conversation:
{history_text}

Relevant documents:
{context}

Current question: {query}

Please provide a comprehensive answer based on the documents and conversation history. If the documents don't contain relevant information, clearly state that."""
        else:
            # Prompt without chat history
            prompt = f"""You are a helpful AI assistant that answers questions based on provided documents.

Relevant documents:
{context}

Question: {query}

Please provide a comprehensive answer based on the documents above. If the documents don't contain relevant information, clearly state that."""
        
        return prompt
    
    async def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from LLM.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            
        Yields:
            Generated text tokens
        """
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/v1/completions",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "top_p": top_p,
                    "top_k": top_k,
                    "stream": True,
                },
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            import json
                            chunk = json.loads(data)
                            if "choices" in chunk and len(chunk["choices"]) > 0:
                                text = chunk["choices"][0].get("text", "")
                                if text:
                                    yield text
                        except json.JSONDecodeError:
                            continue
    
    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> str:
        """Generate non-streaming response from LLM.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            
        Returns:
            Generated text
        """
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{self.base_url}/v1/completions",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "top_p": top_p,
                    "top_k": top_k,
                    "stream": False,
                },
            )
            result = response.json()
            return result["choices"][0]["text"]
