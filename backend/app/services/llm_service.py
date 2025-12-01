"""LLM service using vLLM."""
import httpx
import json
import re
from typing import AsyncGenerator, Optional, List, Dict
from app.core.config import settings


class LLMService:
    """Service for interacting with vLLM inference server."""
    
    # Patterns to clean from responses
    CLEANUP_PATTERNS = [
        # Remove doc:chunk references like [doc:chunk IT-Grundschutz-Check]
        (r'\[doc:chunk[^\]]*\]', ''),
        # Remove markdown-style references like [doc:chunk ...]
        (r'\[doc:[^\]]*\]', ''),
        # Remove separator lines with USER QUESTION or ASSISTANT ANSWER
        (r'\n*---+\s*\n*', '\n\n'),
        # Remove USER QUESTION: markers and everything after
        (r'USER QUESTION:.*$', ''),
        # Remove ASSISTANT ANSWER: markers
        (r'ASSISTANT ANSWER:\s*', ''),
        # Remove Question: markers at the end (indicates model is hallucinating)
        (r'\n*Question:\s*$', ''),
        # Remove User: markers at the end
        (r'\n*User:\s*$', ''),
        # Clean up multiple newlines
        (r'\n{3,}', '\n\n'),
    ]
    
    def __init__(self):
        """Initialize LLM service."""
        self.base_url = f"http://{settings.VLLM_HOST}:{settings.VLLM_PORT}"
        self.default_model = settings.LLM_MODEL
        self.api_key = "dummy"  # API key for vLLM server
        self._cached_model: Optional[str] = None
    
    def clean_response(self, response: str) -> str:
        """Clean up LLM response to remove meta-information and artifacts.
        
        Args:
            response: Raw LLM response
            
        Returns:
            Cleaned response
        """
        cleaned = response
        
        for pattern, replacement in self.CLEANUP_PATTERNS:
            cleaned = re.sub(pattern, replacement, cleaned, flags=re.MULTILINE | re.DOTALL)
        
        # Strip leading/trailing whitespace
        cleaned = cleaned.strip()
        
        # If response ends abruptly (mid-sentence without punctuation), 
        # try to clean up to the last complete sentence
        if cleaned and not cleaned[-1] in '.!?"\')':
            # Find the last sentence-ending punctuation
            last_period = max(cleaned.rfind('.'), cleaned.rfind('!'), cleaned.rfind('?'))
            if last_period > len(cleaned) * 0.5:  # Only truncate if we keep at least half
                cleaned = cleaned[:last_period + 1]
        
        return cleaned
    
    async def get_active_model(self) -> str:
        """Get the currently active model from vLLM."""
        # Query vLLM to get the actual loaded model
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"Authorization": f"Bearer {self.api_key}"}
                response = await client.get(
                    f"{self.base_url}/v1/models",
                    headers=headers
                )
                if response.status_code == 200:
                    data = response.json()
                    if "data" in data and len(data["data"]) > 0:
                        self._cached_model = data["data"][0]["id"]
                        return self._cached_model
        except Exception as e:
            print(f"Error getting model from vLLM: {e}")
        
        # Fallback to cached or default
        return self._cached_model or self.default_model
    
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
        # Clean context chunks - remove any doc references
        cleaned_chunks = []
        for chunk in context_chunks:
            cleaned = chunk
            # Remove doc:chunk references from context as well
            cleaned = re.sub(r'\[doc:chunk[^\]]*\]', '', cleaned)
            cleaned = re.sub(r'\[doc:[^\]]*\]', '', cleaned)
            cleaned_chunks.append(cleaned.strip())
        
        context = "\n\n".join([f"Document {i+1}:\n{chunk}" for i, chunk in enumerate(cleaned_chunks)])
        
        if chat_history and len(chat_history) > 0:
            # Prompt with chat history
            history_text = "\n".join([
                f"User: {msg['query']}\nAssistant: {msg['answer']}"
                for msg in chat_history[-settings.MAX_CHAT_HISTORY:]
            ])
            
            prompt = f"""You are a helpful AI assistant that answers questions based on provided documents and conversation history.

IMPORTANT INSTRUCTIONS:
- Answer ONLY the current question below
- Do NOT generate additional questions or continue the conversation
- Do NOT add markers like "USER QUESTION" or "ASSISTANT ANSWER"
- Do NOT include document references like [doc:chunk ...]
- Provide a complete, well-formed answer that ends with proper punctuation

Previous conversation:
{history_text}

Relevant documents:
{context}

Current question: {query}

Answer:"""
        else:
            # Prompt without chat history
            prompt = f"""You are a helpful AI assistant that answers questions based on provided documents.

IMPORTANT INSTRUCTIONS:
- Answer ONLY the question below
- Do NOT generate additional questions or continue the conversation
- Do NOT add markers like "USER QUESTION" or "ASSISTANT ANSWER"
- Do NOT include document references like [doc:chunk ...]
- Provide a complete, well-formed answer that ends with proper punctuation

Relevant documents:
{context}

Question: {query}

Answer:"""
        
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
        
        # Stop sequences to prevent the model from generating additional Q&A pairs
        stop_sequences = [
            "USER QUESTION:",
            "ASSISTANT ANSWER:",
            "Question:",
            "User:",
            "\n---\n",
            "---\n\nUSER",
            "[doc:chunk",
        ]
        
        print(f"Starting stream request to {self.base_url}/v1/completions")
        print(f"Model: {model}, max_tokens: {max_tokens}")
        
        accumulated_response = ""
        
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
                    "stop": stop_sequences,
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
                                    accumulated_response += text
                                    
                                    # Check if we should stop due to problematic patterns
                                    should_stop = False
                                    for stop_seq in stop_sequences:
                                        if stop_seq in accumulated_response:
                                            # Truncate at the stop sequence
                                            stop_idx = accumulated_response.find(stop_seq)
                                            accumulated_response = accumulated_response[:stop_idx]
                                            should_stop = True
                                            break
                                    
                                    if should_stop:
                                        print(f"Stopping due to stop sequence detected")
                                        break
                                    
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
            Generated text (cleaned)
        """
        model = await self.get_active_model()
        
        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        # Stop sequences to prevent the model from generating additional Q&A pairs
        stop_sequences = [
            "USER QUESTION:",
            "ASSISTANT ANSWER:",
            "Question:",
            "User:",
            "\n---\n",
            "---\n\nUSER",
            "[doc:chunk",
        ]
        
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
                    "stop": stop_sequences,
                },
            )
            result = response.json()
            raw_response = result["choices"][0]["text"]
            
            # Clean the response before returning
            return self.clean_response(raw_response)
