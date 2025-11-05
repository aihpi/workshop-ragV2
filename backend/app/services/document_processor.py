"""Document processing service."""
import hashlib
import os
from pathlib import Path
from typing import List, Tuple, Optional
from datetime import datetime
import PyPDF2
from docx import Document
from bs4 import BeautifulSoup


class DocumentProcessor:
    """Handles document parsing, chunking, and metadata extraction."""
    
    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 128):
        """Initialize document processor.
        
        Args:
            chunk_size: Number of tokens per chunk
            chunk_overlap: Number of overlapping tokens between chunks
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA-256 hash of file.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Hexadecimal hash string
        """
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def parse_pdf(self, file_path: str) -> str:
        """Extract text from PDF file.
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Extracted text content
        """
        text = ""
        with open(file_path, "rb") as f:
            pdf_reader = PyPDF2.PdfReader(f)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text
    
    def parse_docx(self, file_path: str) -> str:
        """Extract text from DOCX file.
        
        Args:
            file_path: Path to DOCX file
            
        Returns:
            Extracted text content
        """
        doc = Document(file_path)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text
    
    def parse_txt(self, file_path: str) -> str:
        """Extract text from TXT file.
        
        Args:
            file_path: Path to TXT file
            
        Returns:
            Extracted text content
        """
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    
    def parse_html(self, file_path: str) -> str:
        """Extract text from HTML file.
        
        Args:
            file_path: Path to HTML file
            
        Returns:
            Extracted text content
        """
        with open(file_path, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "lxml")
            return soup.get_text(separator="\n", strip=True)
    
    def parse_xml(self, file_path: str) -> str:
        """Extract text from XML file.
        
        Args:
            file_path: Path to XML file
            
        Returns:
            Extracted text content
        """
        with open(file_path, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "lxml-xml")
            return soup.get_text(separator="\n", strip=True)
    
    def parse_md(self, file_path: str) -> str:
        """Extract text from Markdown file.
        
        Args:
            file_path: Path to MD file
            
        Returns:
            Extracted text content
        """
        return self.parse_txt(file_path)
    
    def parse_document(self, file_path: str) -> str:
        """Parse document based on file extension.
        
        Args:
            file_path: Path to document file
            
        Returns:
            Extracted text content
            
        Raises:
            ValueError: If file type is not supported
        """
        ext = Path(file_path).suffix.lower()
        
        parsers = {
            ".pdf": self.parse_pdf,
            ".txt": self.parse_txt,
            ".docx": self.parse_docx,
            ".doc": self.parse_docx,
            ".html": self.parse_html,
            ".htm": self.parse_html,
            ".xml": self.parse_xml,
            ".md": self.parse_md,
        }
        
        parser = parsers.get(ext)
        if parser is None:
            raise ValueError(f"Unsupported file type: {ext}")
        
        return parser(file_path)
    
    def simple_tokenize(self, text: str) -> List[str]:
        """Simple whitespace tokenization.
        
        Args:
            text: Input text
            
        Returns:
            List of tokens
        """
        return text.split()
    
    def chunk_text(self, text: str) -> List[str]:
        """Chunk text into overlapping segments.
        
        Args:
            text: Input text to chunk
            
        Returns:
            List of text chunks
        """
        tokens = self.simple_tokenize(text)
        chunks = []
        
        if len(tokens) <= self.chunk_size:
            return [text]
        
        start = 0
        while start < len(tokens):
            end = start + self.chunk_size
            chunk_tokens = tokens[start:end]
            chunks.append(" ".join(chunk_tokens))
            
            if end >= len(tokens):
                break
                
            start += self.chunk_size - self.chunk_overlap
        
        return chunks
    
    def process_document(self, file_path: str) -> Tuple[str, List[str], dict]:
        """Process document: parse, chunk, and extract metadata.
        
        Args:
            file_path: Path to document file
            
        Returns:
            Tuple of (document_id, chunks, metadata)
        """
        # Calculate document ID
        document_id = self.calculate_file_hash(file_path)
        
        # Parse document
        text = self.parse_document(file_path)
        
        # Chunk text
        chunks = self.chunk_text(text)
        
        # Extract metadata
        file_stat = os.stat(file_path)
        metadata = {
            "filename": Path(file_path).name,
            "file_type": Path(file_path).suffix.lower(),
            "file_size": file_stat.st_size,
            "upload_date": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
            "document_id": document_id,
            "num_chunks": len(chunks),
        }
        
        return document_id, chunks, metadata
