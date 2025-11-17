"""LLM service using vLLM."""
import httpx
import json
from typing import AsyncGenerator, Optional, List, Dict
from app.core.config import settings


class LLMService:
    """Service for interacting with vLLM inference server."""
    
    def __init__(self):
        """Initialize LLM service."""
        self.base_url = f"http://{settings.VLLM_HOST}:{settings.VLLM_PORT}"
        self.default_model = settings.LLM_MODEL
        self.api_key = "dummy"  # API key for vLLM server
    
    async def get_active_model(self) -> str:
        """Get the currently active model from vLLM."""
        # Simply use the model that vLLM was started with
        # You can query vLLM's /v1/models endpoint if needed, but the model path is sufficient
        return self.default_model
    
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
        """Generate streaming response from LLM using vLLM.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            
        Yields:
            Generated text tokens
        """
        model = await self.get_active_model()
        
        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        print(f"Starting stream request to {self.base_url}/v1/completions")
        print(f"Model: {model}, max_tokens: {max_tokens}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/v1/completions",
                headers=headers,
                json={
                    "model": model,
                    "prompt": prompt,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "top_p": top_p,
                    "top_k": top_k,
                    "stream": True,
                },
            ) as response:
                print(f"Response status: {response.status_code}")
                line_count = 0
                async for line in response.aiter_lines():
                    line_count += 1
                    if not line or line.strip() == "":
                        continue
                    
                    print(f"Line {line_count}: {line[:100]}")
                    
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            print("Received [DONE]")
                            break
                        try:
                            chunk = json.loads(data)
                            if "choices" in chunk and len(chunk["choices"]) > 0:
                                text = chunk["choices"][0].get("text", "")
                                if text:
                                    print(f"Yielding token: {text}")
                                    yield text
                        except json.JSONDecodeError as e:
                            print(f"JSON decode error: {e}, line: {line[:100]}")
                            continue
                        except Exception as e:
                            print(f"Error processing chunk: {e}")
                            continue
                
                print(f"Stream ended after {line_count} lines")
    
    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> str:
        """Generate non-streaming response from LLM using vLLM.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            
        Returns:
            Generated text
        """
        model = await self.get_active_model()
        
        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{self.base_url}/v1/completions",
                headers=headers,
                json={
                    "model": model,
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
