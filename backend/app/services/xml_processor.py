"""XML processor for DocBook 5.0 IT-Grundschutz Kompendium documents.

Extracts hierarchical structure, entities, metadata, and relationships
for knowledge graph construction and Graph RAG integration.
"""
import re
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Set
from dataclasses import dataclass, field
from enum import Enum
import defusedxml.ElementTree as ET
from datetime import datetime


class EntityType(str, Enum):
    """Types of entities extracted from IT-Grundschutz documents."""
    SCHICHT = "schicht"
    BAUSTEIN = "baustein"
    GEFAEHRDUNG = "gefaehrdung"
    ANFORDERUNG = "anforderung"
    ROLLE = "rolle"
    GLOSSARY_TERM = "glossary_term"
    STANDARD = "standard"


class AnforderungTyp(str, Enum):
    """Requirement types in IT-Grundschutz."""
    BASIS = "B"  # Basis-Anforderung
    STANDARD = "S"  # Standard-Anforderung
    HOCH = "H"  # Anforderung bei erhöhtem Schutzbedarf


@dataclass
class ExtractedEntity:
    """Represents an extracted entity from the document."""
    id: str
    type: EntityType
    title: str
    content: str
    bookmark_id: Optional[str] = None
    parent_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "title": self.title,
            "content": self.content,
            "bookmark_id": self.bookmark_id,
            "parent_id": self.parent_id,
            "metadata": self.metadata
        }


@dataclass
class ExtractedRelationship:
    """Represents a relationship between entities."""
    source_id: str
    target_id: str
    relationship_type: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_id": self.source_id,
            "target_id": self.target_id,
            "relationship_type": self.relationship_type,
            "metadata": self.metadata
        }


@dataclass
class ExtractedChunk:
    """Represents a text chunk with enriched metadata for vector storage."""
    id: str
    content: str
    entity_id: str
    entity_type: EntityType
    bookmark_id: Optional[str] = None
    chunk_index: int = 0
    total_chunks: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)
    glossary_term_ids: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "entity_id": self.entity_id,
            "entity_type": self.entity_type.value,
            "bookmark_id": self.bookmark_id,
            "chunk_index": self.chunk_index,
            "total_chunks": self.total_chunks,
            "metadata": self.metadata,
            "glossary_term_ids": self.glossary_term_ids
        }


@dataclass
class XMLProcessingResult:
    """Complete result of XML processing."""
    document_id: str
    filename: str
    entities: List[ExtractedEntity]
    relationships: List[ExtractedRelationship]
    chunks: List[ExtractedChunk]
    glossary_terms: Dict[str, str]  # term -> definition
    processing_stats: Dict[str, Any]


class DocBookXMLProcessor:
    """Processor for DocBook 5.0 XML documents (IT-Grundschutz Kompendium).
    
    Extracts:
    - Hierarchical structure (Schichten, Bausteine, Gefährdungen, Anforderungen)
    - Glossary terms for linking
    - Cross-references between sections
    - Standard references (ISO, NIST, BSI)
    - Role assignments
    - Bookmark IDs for deep linking
    """
    
    # DocBook namespace
    DOCBOOK_NS = "http://docbook.org/ns/docbook"
    NS = {"db": DOCBOOK_NS}
    
    # Schicht (layer) patterns - top level categories
    SCHICHT_PATTERNS = {
        "ISMS": "Sicherheitsmanagement",
        "ORP": "Organisation und Personal",
        "CON": "Konzepte und Vorgehensweisen",
        "OPS": "Betrieb",
        "DER": "Detektion und Reaktion",
        "APP": "Anwendungen",
        "SYS": "IT-Systeme",
        "IND": "Industrielle IT",
        "NET": "Netze und Kommunikation",
        "INF": "Infrastruktur"
    }
    
    # Regex patterns for entity detection
    BAUSTEIN_PATTERN = re.compile(r'^(ISMS|ORP|CON|OPS|DER|APP|SYS|IND|NET|INF)\.[0-9]+(?:\.[0-9]+)?')
    GEFAEHRDUNG_PATTERN = re.compile(r'^G\s*0?\.[0-9]+')
    ANFORDERUNG_PATTERN = re.compile(r'^([A-Z]+\.[0-9]+(?:\.[0-9]+)?\.A[0-9]+)')
    ANFORDERUNG_TYP_PATTERN = re.compile(r'\(([BSH])\)\s*$')
    CROSS_REFERENCE_PATTERN = re.compile(r'siehe\s+([A-Z]+\.[0-9]+(?:\.[0-9]+)?(?:\.A[0-9]+)?)', re.IGNORECASE)
    STANDARD_REFERENCE_PATTERN = re.compile(
        r'(ISO[/\s]*(?:IEC)?\s*[0-9]+(?:[:-][0-9]+)?|'
        r'NIST\s+(?:SP\s*)?[0-9]+(?:-[0-9]+)?|'
        r'BSI-Standard\s*[0-9]+(?:-[0-9]+)?)',
        re.IGNORECASE
    )
    
    # Role patterns
    ROLE_PATTERNS = [
        "ISB", "IT-Betrieb", "Benutzende", "Datenschutzbeauftragte",
        "Institutionsleitung", "Vorgesetzte", "Mitarbeitende",
        "Personalabteilung", "Haustechnik", "Beschaffung",
        "IT-Administratoren", "Entwickelnde", "Fachverantwortliche"
    ]
    
    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 128,
        extract_glossary: bool = True,
        track_discontinued: bool = True,
        store_bookmark_ids: bool = True,
        glossary_linking: str = "exact_match"  # or "fuzzy"
    ):
        """Initialize the DocBook XML processor.
        
        Args:
            chunk_size: Maximum tokens per chunk
            chunk_overlap: Overlap between chunks
            extract_glossary: Whether to extract glossary terms
            track_discontinued: Whether to track discontinued (entfallen) requirements
            store_bookmark_ids: Whether to store bookmark IDs for deep linking
            glossary_linking: Strategy for linking chunks to glossary ("exact_match" or "fuzzy")
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.extract_glossary = extract_glossary
        self.track_discontinued = track_discontinued
        self.store_bookmark_ids = store_bookmark_ids
        self.glossary_linking = glossary_linking
        
        # Internal state during processing
        self._entities: List[ExtractedEntity] = []
        self._relationships: List[ExtractedRelationship] = []
        self._chunks: List[ExtractedChunk] = []
        self._glossary_terms: Dict[str, str] = {}
        self._role_pattern = re.compile(
            r'\[(' + '|'.join(re.escape(r) for r in self.ROLE_PATTERNS) + r')\]'
        )
    
    def calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA-256 hash of file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def generate_entity_id(self, entity_type: EntityType, identifier: str) -> str:
        """Generate a unique entity ID."""
        return f"{entity_type.value}:{identifier}"
    
    def _get_element_text(self, element) -> str:
        """Extract all text content from an element recursively."""
        if element is None:
            return ""
        text_parts = []
        if element.text:
            text_parts.append(element.text)
        for child in element:
            text_parts.append(self._get_element_text(child))
            if child.tail:
                text_parts.append(child.tail)
        return " ".join(text_parts).strip()
    
    def _get_bookmark_id(self, element) -> Optional[str]:
        """Extract xml:id (bookmark) from element."""
        return element.get("{http://www.w3.org/XML/1998/namespace}id")
    
    def _extract_roles_from_title(self, title: str) -> List[str]:
        """Extract role assignments from section title."""
        matches = self._role_pattern.findall(title)
        return matches if matches else []
    
    def _extract_anforderung_typ(self, title: str) -> Optional[AnforderungTyp]:
        """Extract requirement type (B/S/H) from title."""
        match = self.ANFORDERUNG_TYP_PATTERN.search(title)
        if match:
            typ = match.group(1)
            return AnforderungTyp(typ)
        return None
    
    def _is_discontinued(self, title: str, content: str) -> bool:
        """Check if requirement is marked as discontinued (ENTFALLEN)."""
        return "ENTFALLEN" in title or "Diese Anforderung ist entfallen" in content
    
    def _extract_cross_references(self, text: str) -> List[str]:
        """Extract cross-references from text."""
        return self.CROSS_REFERENCE_PATTERN.findall(text)
    
    def _extract_standard_references(self, text: str) -> List[str]:
        """Extract standard references (ISO, NIST, BSI) from text."""
        return self.STANDARD_REFERENCE_PATTERN.findall(text)
    
    def _extract_glossary(self, root) -> Dict[str, str]:
        """Extract glossary terms and definitions from the document."""
        glossary_terms = {}
        
        # Look for the glossary chapter (usually titled "Glossar" or contains glossary entries)
        for chapter in root.findall(".//db:chapter", self.NS):
            title_elem = chapter.find("db:title", self.NS)
            if title_elem is not None and "Glossar" in self._get_element_text(title_elem):
                # Find all paragraph elements with strong emphasis (term definitions)
                for para in chapter.findall(".//db:para", self.NS):
                    # Look for terms in emphasis/strong tags
                    emphasis = para.find("db:emphasis[@role='strong']", self.NS)
                    if emphasis is not None:
                        term = self._get_element_text(emphasis).strip()
                        # Get the rest of the paragraph as definition
                        full_text = self._get_element_text(para)
                        # Remove the term from the beginning to get definition
                        definition = full_text.replace(term, "", 1).strip()
                        if term and definition:
                            glossary_terms[term] = definition
                            # Create glossary term entity
                            entity_id = self.generate_entity_id(
                                EntityType.GLOSSARY_TERM,
                                hashlib.md5(term.encode()).hexdigest()[:8]
                            )
                            entity = ExtractedEntity(
                                id=entity_id,
                                type=EntityType.GLOSSARY_TERM,
                                title=term,
                                content=definition,
                                bookmark_id=self._get_bookmark_id(para),
                                metadata={"original_term": term}
                            )
                            self._entities.append(entity)
        
        return glossary_terms
    
    def _link_glossary_terms(self, text: str) -> List[str]:
        """Find glossary terms used in text and return their IDs."""
        matched_term_ids = []
        if not self._glossary_terms:
            return matched_term_ids
        
        text_lower = text.lower()
        for term in self._glossary_terms.keys():
            # Case-insensitive exact match for German compound words
            if term.lower() in text_lower:
                entity_id = self.generate_entity_id(
                    EntityType.GLOSSARY_TERM,
                    hashlib.md5(term.encode()).hexdigest()[:8]
                )
                if entity_id not in matched_term_ids:
                    matched_term_ids.append(entity_id)
        
        return matched_term_ids
    
    def _detect_schicht(self, baustein_id: str) -> Optional[str]:
        """Detect which Schicht (layer) a Baustein belongs to."""
        match = self.BAUSTEIN_PATTERN.match(baustein_id)
        if match:
            prefix = baustein_id.split(".")[0]
            if prefix in self.SCHICHT_PATTERNS:
                return prefix
        return None
    
    def _simple_tokenize(self, text: str) -> List[str]:
        """Simple whitespace tokenization."""
        return text.split()
    
    def _chunk_text(self, text: str, entity_id: str, entity_type: EntityType,
                    bookmark_id: Optional[str], metadata: Dict[str, Any]) -> List[ExtractedChunk]:
        """Chunk text into overlapping segments with metadata."""
        tokens = self._simple_tokenize(text)
        chunks = []
        
        if len(tokens) <= self.chunk_size:
            chunk_id = f"{entity_id}:chunk:0"
            chunk = ExtractedChunk(
                id=chunk_id,
                content=text,
                entity_id=entity_id,
                entity_type=entity_type,
                bookmark_id=bookmark_id,
                chunk_index=0,
                total_chunks=1,
                metadata=metadata.copy(),
                glossary_term_ids=self._link_glossary_terms(text)
            )
            chunks.append(chunk)
            return chunks
        
        chunk_contents = []
        start = 0
        while start < len(tokens):
            end = start + self.chunk_size
            chunk_tokens = tokens[start:end]
            chunk_contents.append(" ".join(chunk_tokens))
            
            if end >= len(tokens):
                break
            start += self.chunk_size - self.chunk_overlap
        
        for i, content in enumerate(chunk_contents):
            chunk_id = f"{entity_id}:chunk:{i}"
            chunk = ExtractedChunk(
                id=chunk_id,
                content=content,
                entity_id=entity_id,
                entity_type=entity_type,
                bookmark_id=bookmark_id,
                chunk_index=i,
                total_chunks=len(chunk_contents),
                metadata=metadata.copy(),
                glossary_term_ids=self._link_glossary_terms(content)
            )
            chunks.append(chunk)
        
        return chunks
    
    def _process_gefaehrdungen_chapter(self, chapter) -> None:
        """Process the Elementare Gefährdungen (threats) chapter."""
        title_elem = chapter.find("db:title", self.NS)
        chapter_title = self._get_element_text(title_elem) if title_elem is not None else ""
        
        if "Elementare Gefährdungen" not in chapter_title:
            return
        
        # Find all sections within the chapter (each is a Gefährdung)
        for section in chapter.findall(".//db:section", self.NS):
            sec_title_elem = section.find("db:title", self.NS)
            if sec_title_elem is None:
                continue
            
            sec_title = self._get_element_text(sec_title_elem)
            
            # Check if this looks like a Gefährdung
            if self.GEFAEHRDUNG_PATTERN.match(sec_title):
                bookmark_id = self._get_bookmark_id(section)
                content = self._get_element_text(section)
                
                # Extract the Gefährdung ID (e.g., "G 0.1")
                match = self.GEFAEHRDUNG_PATTERN.match(sec_title)
                if match:
                    gef_id = match.group(0).replace(" ", "")
                    entity_id = self.generate_entity_id(EntityType.GEFAEHRDUNG, gef_id)
                    
                    metadata = {
                        "gefaehrdung_id": gef_id,
                        "cross_references": self._extract_cross_references(content),
                        "standard_references": self._extract_standard_references(content)
                    }
                    
                    entity = ExtractedEntity(
                        id=entity_id,
                        type=EntityType.GEFAEHRDUNG,
                        title=sec_title,
                        content=content,
                        bookmark_id=bookmark_id if self.store_bookmark_ids else None,
                        metadata=metadata
                    )
                    self._entities.append(entity)
                    
                    # Create chunks
                    chunks = self._chunk_text(
                        content, entity_id, EntityType.GEFAEHRDUNG,
                        bookmark_id if self.store_bookmark_ids else None, metadata
                    )
                    self._chunks.extend(chunks)
    
    def _process_baustein_section(self, section, schicht_id: Optional[str] = None) -> None:
        """Process a Baustein (building block) section."""
        title_elem = section.find("db:title", self.NS)
        if title_elem is None:
            return
        
        title = self._get_element_text(title_elem)
        
        # Check if this is a Baustein section
        baustein_match = self.BAUSTEIN_PATTERN.match(title)
        if not baustein_match:
            return
        
        baustein_code = baustein_match.group(0)
        bookmark_id = self._get_bookmark_id(section)
        content = self._get_element_text(section)
        
        # Detect Schicht if not provided
        if schicht_id is None:
            schicht_prefix = self._detect_schicht(baustein_code)
            if schicht_prefix:
                schicht_id = self.generate_entity_id(EntityType.SCHICHT, schicht_prefix)
        
        entity_id = self.generate_entity_id(EntityType.BAUSTEIN, baustein_code)
        
        metadata = {
            "baustein_code": baustein_code,
            "schicht": self._detect_schicht(baustein_code),
            "cross_references": self._extract_cross_references(content),
            "standard_references": self._extract_standard_references(content)
        }
        
        entity = ExtractedEntity(
            id=entity_id,
            type=EntityType.BAUSTEIN,
            title=title,
            content=content,
            bookmark_id=bookmark_id if self.store_bookmark_ids else None,
            parent_id=schicht_id,
            metadata=metadata
        )
        self._entities.append(entity)
        
        # Create relationship to Schicht
        if schicht_id:
            rel = ExtractedRelationship(
                source_id=entity_id,
                target_id=schicht_id,
                relationship_type="BELONGS_TO"
            )
            self._relationships.append(rel)
        
        # Process Anforderungen within this Baustein
        self._process_anforderungen(section, entity_id, baustein_code)
        
        # Create chunks for Baustein description (not the full content including Anforderungen)
        # Find description section
        for subsection in section.findall("db:section", self.NS):
            sub_title_elem = subsection.find("db:title", self.NS)
            if sub_title_elem is not None:
                sub_title = self._get_element_text(sub_title_elem)
                if sub_title in ["Beschreibung", "Einleitung", "Zielsetzung"]:
                    desc_content = self._get_element_text(subsection)
                    chunks = self._chunk_text(
                        desc_content, entity_id, EntityType.BAUSTEIN,
                        bookmark_id if self.store_bookmark_ids else None, metadata
                    )
                    self._chunks.extend(chunks)
    
    def _process_anforderungen(self, baustein_section, baustein_entity_id: str, 
                                baustein_code: str) -> None:
        """Process Anforderungen (requirements) within a Baustein."""
        # Anforderungen are in nested sections
        for section in baustein_section.findall(".//db:section", self.NS):
            title_elem = section.find("db:title", self.NS)
            if title_elem is None:
                continue
            
            title = self._get_element_text(title_elem)
            
            # Check if this is an Anforderung
            anf_match = self.ANFORDERUNG_PATTERN.match(title)
            if not anf_match:
                continue
            
            anf_code = anf_match.group(1)
            bookmark_id = self._get_bookmark_id(section)
            content = self._get_element_text(section)
            
            # Extract Anforderung type (B/S/H)
            anf_typ = self._extract_anforderung_typ(title)
            
            # Check if discontinued
            is_discontinued = self._is_discontinued(title, content)
            
            # Extract roles from title
            roles = self._extract_roles_from_title(title)
            
            entity_id = self.generate_entity_id(EntityType.ANFORDERUNG, anf_code)
            
            metadata = {
                "anforderung_code": anf_code,
                "baustein_code": baustein_code,
                "anforderung_typ": anf_typ.value if anf_typ else None,
                "roles": roles,
                "cross_references": self._extract_cross_references(content),
                "standard_references": self._extract_standard_references(content)
            }
            
            if self.track_discontinued and is_discontinued:
                metadata["status"] = "entfallen"
            
            entity = ExtractedEntity(
                id=entity_id,
                type=EntityType.ANFORDERUNG,
                title=title,
                content=content,
                bookmark_id=bookmark_id if self.store_bookmark_ids else None,
                parent_id=baustein_entity_id,
                metadata=metadata
            )
            self._entities.append(entity)
            
            # Create relationship to Baustein
            rel = ExtractedRelationship(
                source_id=entity_id,
                target_id=baustein_entity_id,
                relationship_type="BELONGS_TO"
            )
            self._relationships.append(rel)
            
            # Create relationships for cross-references
            for cross_ref in metadata.get("cross_references", []):
                # Determine if cross-ref is to Anforderung or Baustein
                if ".A" in cross_ref:
                    target_type = EntityType.ANFORDERUNG
                else:
                    target_type = EntityType.BAUSTEIN
                target_id = self.generate_entity_id(target_type, cross_ref)
                ref_rel = ExtractedRelationship(
                    source_id=entity_id,
                    target_id=target_id,
                    relationship_type="REFERENCES"
                )
                self._relationships.append(ref_rel)
            
            # Create relationships for roles
            for role in roles:
                role_entity_id = self.generate_entity_id(EntityType.ROLLE, role)
                
                # Create role entity if not exists (check will be done later)
                role_entity = ExtractedEntity(
                    id=role_entity_id,
                    type=EntityType.ROLLE,
                    title=role,
                    content=f"Rolle: {role}",
                    metadata={"role_name": role}
                )
                # Add only if not already present
                if not any(e.id == role_entity_id for e in self._entities):
                    self._entities.append(role_entity)
                
                role_rel = ExtractedRelationship(
                    source_id=role_entity_id,
                    target_id=entity_id,
                    relationship_type="ZUSTAENDIG_FUER"
                )
                self._relationships.append(role_rel)
            
            # Create chunks for Anforderung
            if not (self.track_discontinued and is_discontinued):
                # Only chunk non-discontinued requirements (or all if not tracking)
                chunks = self._chunk_text(
                    content, entity_id, EntityType.ANFORDERUNG,
                    bookmark_id if self.store_bookmark_ids else None, metadata
                )
                self._chunks.extend(chunks)
    
    def _create_schicht_entities(self) -> None:
        """Create Schicht entities based on detected Bausteine."""
        schicht_codes = set()
        
        for entity in self._entities:
            if entity.type == EntityType.BAUSTEIN:
                schicht = entity.metadata.get("schicht")
                if schicht:
                    schicht_codes.add(schicht)
        
        for code in schicht_codes:
            entity_id = self.generate_entity_id(EntityType.SCHICHT, code)
            title = f"{code} - {self.SCHICHT_PATTERNS.get(code, 'Unbekannt')}"
            
            entity = ExtractedEntity(
                id=entity_id,
                type=EntityType.SCHICHT,
                title=title,
                content=f"Schicht {code}: {self.SCHICHT_PATTERNS.get(code, '')}",
                metadata={"schicht_code": code}
            )
            self._entities.append(entity)
    
    def _extract_standard_entities(self) -> None:
        """Create Standard entities from all extracted standard references."""
        standard_refs: Set[str] = set()
        
        for entity in self._entities:
            refs = entity.metadata.get("standard_references", [])
            standard_refs.update(refs)
        
        for ref in standard_refs:
            # Normalize the reference
            normalized = ref.upper().replace(" ", "")
            entity_id = self.generate_entity_id(EntityType.STANDARD, normalized)
            
            entity = ExtractedEntity(
                id=entity_id,
                type=EntityType.STANDARD,
                title=ref,
                content=f"Standard: {ref}",
                metadata={"standard_reference": ref}
            )
            self._entities.append(entity)
            
            # Create BASIERT_AUF relationships from entities that reference this standard
            for other_entity in self._entities:
                if ref in other_entity.metadata.get("standard_references", []):
                    rel = ExtractedRelationship(
                        source_id=other_entity.id,
                        target_id=entity_id,
                        relationship_type="BASIERT_AUF"
                    )
                    self._relationships.append(rel)
    
    def _create_glossary_relationships(self) -> None:
        """Create USES_TERM relationships between chunks and glossary terms."""
        for chunk in self._chunks:
            for term_id in chunk.glossary_term_ids:
                rel = ExtractedRelationship(
                    source_id=chunk.entity_id,
                    target_id=term_id,
                    relationship_type="USES_TERM"
                )
                self._relationships.append(rel)
    
    def process_file(self, file_path: str) -> XMLProcessingResult:
        """Process an XML file and extract all entities, relationships, and chunks.
        
        Args:
            file_path: Path to the XML file
            
        Returns:
            XMLProcessingResult with all extracted data
        """
        # Reset internal state
        self._entities = []
        self._relationships = []
        self._chunks = []
        self._glossary_terms = {}
        
        start_time = datetime.now()
        
        # Parse the XML file
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Calculate document ID
        document_id = self.calculate_file_hash(file_path)
        filename = Path(file_path).name
        
        # Extract glossary first (for linking)
        if self.extract_glossary:
            self._glossary_terms = self._extract_glossary(root)
        
        # Process chapters
        for chapter in root.findall(".//db:chapter", self.NS):
            title_elem = chapter.find("db:title", self.NS)
            if title_elem is None:
                continue
            
            title = self._get_element_text(title_elem)
            
            # Check for Gefährdungen chapter
            if "Elementare Gefährdungen" in title:
                self._process_gefaehrdungen_chapter(chapter)
                continue
            
            # Process Bausteine in chapter
            for section in chapter.findall("db:section", self.NS):
                self._process_baustein_section(section)
        
        # Also check for Bausteine directly in sections (some documents structure differently)
        for section in root.findall(".//db:section", self.NS):
            title_elem = section.find("db:title", self.NS)
            if title_elem is not None:
                title = self._get_element_text(title_elem)
                if self.BAUSTEIN_PATTERN.match(title):
                    # Check if already processed
                    baustein_code = self.BAUSTEIN_PATTERN.match(title).group(0)
                    entity_id = self.generate_entity_id(EntityType.BAUSTEIN, baustein_code)
                    if not any(e.id == entity_id for e in self._entities):
                        self._process_baustein_section(section)
        
        # Create Schicht entities
        self._create_schicht_entities()
        
        # Extract and create Standard entities
        self._extract_standard_entities()
        
        # Create glossary relationships
        self._create_glossary_relationships()
        
        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()
        
        # Compile statistics
        stats = {
            "processing_time_seconds": processing_time,
            "total_entities": len(self._entities),
            "total_relationships": len(self._relationships),
            "total_chunks": len(self._chunks),
            "total_glossary_terms": len(self._glossary_terms),
            "entities_by_type": {},
            "relationships_by_type": {}
        }
        
        for entity in self._entities:
            t = entity.type.value
            stats["entities_by_type"][t] = stats["entities_by_type"].get(t, 0) + 1
        
        for rel in self._relationships:
            t = rel.relationship_type
            stats["relationships_by_type"][t] = stats["relationships_by_type"].get(t, 0) + 1
        
        return XMLProcessingResult(
            document_id=document_id,
            filename=filename,
            entities=self._entities,
            relationships=self._relationships,
            chunks=self._chunks,
            glossary_terms=self._glossary_terms,
            processing_stats=stats
        )
    
    def get_preset_config(self) -> Dict[str, Any]:
        """Return the IT-Grundschutz preset configuration."""
        return {
            "name": "IT-Grundschutz Kompendium",
            "description": "DocBook 5.0 XML format for BSI IT-Grundschutz documentation",
            "entity_patterns": {
                "baustein": self.BAUSTEIN_PATTERN.pattern,
                "gefaehrdung": self.GEFAEHRDUNG_PATTERN.pattern,
                "anforderung": self.ANFORDERUNG_PATTERN.pattern,
                "anforderung_typ": self.ANFORDERUNG_TYP_PATTERN.pattern,
                "cross_reference": self.CROSS_REFERENCE_PATTERN.pattern,
                "standard_reference": self.STANDARD_REFERENCE_PATTERN.pattern
            },
            "schicht_mapping": self.SCHICHT_PATTERNS,
            "role_patterns": self.ROLE_PATTERNS,
            "glossary_linking": self.glossary_linking,
            "extract_glossary": self.extract_glossary,
            "track_discontinued": self.track_discontinued,
            "store_bookmark_ids": self.store_bookmark_ids
        }
