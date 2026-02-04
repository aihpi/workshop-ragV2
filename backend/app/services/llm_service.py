"""LLM service with provider abstraction (Ollama and OpenAI)."""
import httpx
import json
import re
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional, List, Dict
from pathlib import Path
import openai
from app.core.config import settings


class BaseLLMService(ABC):
    """Abstract base class for LLM services."""
    
    # Patterns to clean from responses
    CLEANUP_PATTERNS = [
        # Remove doc:chunk references like [doc:chunk IT-Grundschutz-Check]
        (r'\[doc:chunk[^\]]*\]', ''),
        # Remove markdown-style references like [doc:chunk ...]
        (r'\[doc:[^\]]*\]', ''),
        # Remove full-width bracket references like 【doc:Passage 1】
        (r'【[^】]*】', ''),
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
        # Remove "Cite passage" instructions that may be echoed
        (r'\.?\s*Cite passage \d+\.?', ''),
        # Remove "Provide that definition" and similar echoed instructions
        (r'\.\s*Provide that [^.]+\.', '.'),
        # Clean up multiple newlines
        (r'\n{3,}', '\n\n'),
        # Clean up multiple spaces
        (r'  +', ' '),
    ]
    
    def clean_response(self, response: str) -> str:
        """Clean up LLM response to remove meta-information and artifacts."""
        cleaned = response
        
        # First, try to remove echoed prompt content before the actual answer
        # Look for patterns like "... Cite passage X. If not enough..." followed by actual content
        preamble_patterns = [
            # Remove "Cite passage X." and anything before it including "If not enough..."
            r'^.*?Cite passage \d+\.\s*(?:If not enough[^.]*\.\s*)?',
            # Remove instruction-like preambles ending with "that."
            r'^.*?(?:answer with that|we answer with that)\.\s*',
        ]
        for pattern in preamble_patterns:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE | re.DOTALL)
        
        for pattern, replacement in self.CLEANUP_PATTERNS:
            cleaned = re.sub(pattern, replacement, cleaned, flags=re.MULTILINE | re.DOTALL)
        
        cleaned = cleaned.strip()
        
        if cleaned and not cleaned[-1] in '.!?"\')':
            last_period = max(cleaned.rfind('.'), cleaned.rfind('!'), cleaned.rfind('?'))
            if last_period > len(cleaned) * 0.5:
                cleaned = cleaned[:last_period + 1]
        
        return cleaned
    
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
    
    @abstractmethod
    async def get_active_model(self) -> str:
        """Get the currently active model."""
        pass
    
    @abstractmethod
    async def set_active_model(self, model_name: str) -> None:
        """Set the active model."""
        pass
    
    @abstractmethod
    async def list_models(self) -> List[Dict[str, any]]:
        """List available models."""
        pass
    
    @abstractmethod
    async def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response."""
        pass
    
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> str:
        """Generate non-streaming response."""
        pass
    
    @classmethod
    @abstractmethod
    async def check_connection(cls) -> Dict[str, any]:
        """Check if the LLM provider is available."""
        pass


class OllamaLLMService(BaseLLMService):
    """Service for interacting with Ollama inference server."""
    
    # File to persist active model selection
    ACTIVE_MODEL_FILE = Path(__file__).parent.parent.parent.parent / ".ollama_model"
    
    def __init__(self):
        """Initialize LLM service for Ollama."""
        self.base_url = f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}"
        self.default_model = settings.OLLAMA_MODEL
        self._cached_model: Optional[str] = None
    
    def _load_active_model(self) -> Optional[str]:
        """Load active model from persistence file."""
        try:
            if self.ACTIVE_MODEL_FILE.exists():
                return self.ACTIVE_MODEL_FILE.read_text().strip()
        except Exception:
            pass
        return None
    
    def _save_active_model(self, model: str) -> None:
        """Save active model to persistence file."""
        try:
            self.ACTIVE_MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
            self.ACTIVE_MODEL_FILE.write_text(model)
        except Exception as e:
            print(f"Error saving active model: {e}")
    
    async def get_active_model(self) -> str:
        """Get the currently active model."""
        saved = self._load_active_model()
        if saved:
            self._cached_model = saved
            return saved
        
        if not self._cached_model:
            self._cached_model = self.default_model
        return self._cached_model
    
    async def set_active_model(self, model_name: str) -> None:
        """Set the active model."""
        self._cached_model = model_name
        self._save_active_model(model_name)
    
    async def list_models(self) -> List[Dict[str, any]]:
        """List available Ollama models."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    return data.get("models", [])
        except Exception as e:
            print(f"Error listing Ollama models: {e}")
        return []
    
    @classmethod
    async def check_connection(cls) -> Dict[str, any]:
        """Check if Ollama is available."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/tags"
                )
                if response.status_code == 200:
                    data = response.json()
                    models = [m["name"] for m in data.get("models", [])]
                    return {"connected": True, "models": models, "error": None}
                return {"connected": False, "models": [], "error": f"Status {response.status_code}"}
        except httpx.ConnectError:
            return {"connected": False, "models": [], "error": f"Cannot connect to Ollama at {settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}"}
        except Exception as e:
            return {"connected": False, "models": [], "error": str(e)}
    
    async def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from Ollama."""
        model = await self.get_active_model()
        
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
            }
        }
        
        print(f"Starting Ollama stream request to {self.base_url}/api/generate")
        print(f"Model: {model}, max_tokens: {max_tokens}")
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/generate",
                    json=payload,
                ) as response:
                    print(f"Response status: {response.status_code}")
                    
                    if response.status_code != 200:
                        error_text = await response.aread()
                        print(f"Error response: {error_text}")
                        yield f"Error: Ollama returned status {response.status_code}"
                        return
                    
                    line_count = 0
                    async for line in response.aiter_lines():
                        if line:
                            line_count += 1
                            try:
                                data = json.loads(line)
                                if "response" in data:
                                    yield data["response"]
                                if data.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                continue
                    
                    print(f"Stream ended after {line_count} lines")
                    
        except httpx.ConnectError as e:
            print(f"Connection error: {e}")
            yield f"Error: Cannot connect to Ollama at {self.base_url}"
        except Exception as e:
            print(f"Error in Ollama stream: {e}")
            yield f"Error: {str(e)}"
    
    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> str:
        """Generate non-streaming response from Ollama."""
        model = await self.get_active_model()
        
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                )
                
                if response.status_code == 200:
                    data = response.json()
                    raw_response = data.get("response", "")
                    return self.clean_response(raw_response)
                else:
                    return f"Error: Ollama returned status {response.status_code}"
                    
        except Exception as e:
            return f"Error: {str(e)}"


class OpenAILLMService(BaseLLMService):
    """Service for interacting with OpenAI-compatible API."""
    
    # File to persist active model selection
    ACTIVE_MODEL_FILE = Path(__file__).parent.parent.parent.parent / ".openai_model"
    
    def __init__(self):
        """Initialize LLM service for OpenAI API."""
        self.client = openai.AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
        self.default_model = settings.OPENAI_LLM_MODEL
        self._cached_model: Optional[str] = None
    
    def _load_active_model(self) -> Optional[str]:
        """Load active model from persistence file."""
        try:
            if self.ACTIVE_MODEL_FILE.exists():
                return self.ACTIVE_MODEL_FILE.read_text().strip()
        except Exception:
            pass
        return None
    
    def _save_active_model(self, model: str) -> None:
        """Save active model to persistence file."""
        try:
            self.ACTIVE_MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
            self.ACTIVE_MODEL_FILE.write_text(model)
        except Exception as e:
            print(f"Error saving active model: {e}")
    
    async def get_active_model(self) -> str:
        """Get the currently active model."""
        saved = self._load_active_model()
        if saved:
            self._cached_model = saved
            return saved
        
        if not self._cached_model:
            self._cached_model = self.default_model
        return self._cached_model
    
    async def set_active_model(self, model_name: str) -> None:
        """Set the active model."""
        self._cached_model = model_name
        self._save_active_model(model_name)
    
    async def list_models(self) -> List[Dict[str, any]]:
        """List available models (returns configured models for OpenAI)."""
        # Return the configured model as the available model
        return [
            {"name": settings.OPENAI_LLM_MODEL, "size": 0},
        ]
    
    @classmethod
    async def check_connection(cls) -> Dict[str, any]:
        """Check if OpenAI API is available."""
        try:
            client = openai.AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
            )
            # Try a simple completion to verify connection
            response = await client.chat.completions.create(
                model=settings.OPENAI_LLM_MODEL,
                messages=[{"role": "user", "content": "test"}],
                max_tokens=1,
            )
            return {
                "connected": True,
                "models": [settings.OPENAI_LLM_MODEL],
                "error": None
            }
        except openai.AuthenticationError:
            return {"connected": False, "models": [], "error": "Invalid API key"}
        except openai.APIConnectionError:
            return {"connected": False, "models": [], "error": f"Cannot connect to API at {settings.OPENAI_BASE_URL}"}
        except Exception as e:
            return {"connected": False, "models": [], "error": str(e)}
    
    async def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from OpenAI API."""
        model = await self.get_active_model()
        
        print(f"Starting OpenAI stream request")
        print(f"Model: {model}, max_tokens: {max_tokens}")
        
        try:
            stream = await self.client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stream=True,
            )
            
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except openai.APIConnectionError as e:
            print(f"Connection error: {e}")
            yield f"Error: Cannot connect to API at {settings.OPENAI_BASE_URL}"
        except Exception as e:
            print(f"Error in OpenAI stream: {e}")
            yield f"Error: {str(e)}"
    
    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 512,
        top_p: float = 0.9,
        top_k: int = 40,
    ) -> str:
        """Generate non-streaming response from OpenAI API."""
        model = await self.get_active_model()
        
        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
            )
            
            raw_response = response.choices[0].message.content or ""
            return self.clean_response(raw_response)
                    
        except Exception as e:
            return f"Error: {str(e)}"


# Backward compatibility alias
LLMService = OllamaLLMService


def get_llm_service() -> BaseLLMService:
    """Factory function to get the appropriate LLM service based on config."""
    if settings.LLM_PROVIDER == "openai":
        return OpenAILLMService()
    return OllamaLLMService()


def get_llm_service_class():
    """Get the appropriate LLM service class based on config."""
    if settings.LLM_PROVIDER == "openai":
        return OpenAILLMService
    return OllamaLLMService
