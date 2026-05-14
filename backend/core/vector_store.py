"""
AyuScout V2 — Vector Store (ChromaDB)
======================================
Stores adverse event embeddings for zero-day signal detection.
Uses sentence-transformers for embedding generation and
ChromaDB for local persistent vector storage.

Can be swapped to Pinecone by changing only this file.
"""

import os
import json
from datetime import datetime
from typing import List, Optional

try:
    import chromadb
    from chromadb.config import Settings
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    print("⚠️ ChromaDB not installed. Vector store disabled. Run: pip install chromadb")

try:
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    print("⚠️ Google Generative AI Embeddings not installed.")



class AdverseEventVectorStore:
    """
    ChromaDB-based vector store for adverse event clustering.
    Enables zero-day side effect detection through similarity search.
    """
    
    def __init__(self, persist_directory: str = None):
        self._initialized = False
        
        if not CHROMADB_AVAILABLE:
            print("⚠️ Vector Store: ChromaDB unavailable. Operating in no-op mode.")
            return
        
        persist_dir = persist_directory or os.getenv("CHROMADB_PATH", "./chroma_db")
        
        try:
            self._client = chromadb.PersistentClient(path=persist_dir)
            self._collection = self._client.get_or_create_collection(
                name="adverse_events",
                metadata={"description": "AyuScout V2 Adverse Event Embeddings"}
            )
            self._initialized = True
            print(f"✅ Vector Store: ChromaDB initialized at '{persist_dir}'")
            print(f"   📊 Collection 'adverse_events' has {self._collection.count()} entries")
        except Exception as e:
            print(f"⚠️ Vector Store: ChromaDB init failed ({e}). Operating in no-op mode.")
        
        # Embedding model will be loaded lazily on first use
        self._embedder = None
        self._embedder_model_name = 'all-MiniLM-L6-v2'

    @property
    def embedder(self):
        """Lazily load the cloud embedding model."""
        if self._embedder is None and EMBEDDINGS_AVAILABLE and self._initialized:
            try:
                api_key = os.getenv("GOOGLE_API_KEY")
                if api_key:
                    print("🧬 Vector Store: Initializing Gemini Cloud Embeddings...")
                    self._embedder = GoogleGenerativeAIEmbeddings(
                        model="models/embedding-001",
                        google_api_key=api_key
                    )
                    print("✅ Vector Store: Cloud Embeddings active")
                else:
                    print("⚠️ Vector Store: GOOGLE_API_KEY missing. Cloud embeddings unavailable.")
            except Exception as e:
                print(f"⚠️ Vector Store: Cloud Embedding init failed ({e}).")
        return self._embedder


    
    def store_event(self, event_text: str, metadata: dict) -> Optional[str]:
        """
        Store an adverse event with its embedding.
        
        Args:
            event_text: Description of the adverse event (e.g., "Lisinopril -> Angioedema")
            metadata: Dict with keys like drug, event, causality, confidence, timestamp
            
        Returns:
            str: Event ID if stored successfully, None otherwise
        """
        if not self._initialized:
            return None
        
        try:
            # Generate unique ID
            event_id = f"ae_{datetime.now().strftime('%Y%m%d%H%M%S')}_{hash(event_text) % 10000:04d}"
            
            # Ensure all metadata values are strings (ChromaDB requirement)
            clean_metadata = {}
            for k, v in metadata.items():
                if v is None:
                    clean_metadata[k] = "Unknown"
                elif isinstance(v, (list, dict)):
                    clean_metadata[k] = json.dumps(v)
                else:
                    clean_metadata[k] = str(v)
            
            clean_metadata["stored_at"] = datetime.now().isoformat()
            
            # Generate embedding or let ChromaDB handle it
            if self.embedder:
                # Cloud embeddings use embed_query
                embedding = self.embedder.embed_query(event_text)
                self._collection.add(
                    ids=[event_id],
                    documents=[event_text],
                    embeddings=[embedding],
                    metadatas=[clean_metadata]
                )

            else:
                self._collection.add(
                    ids=[event_id],
                    documents=[event_text],
                    metadatas=[clean_metadata]
                )

            
            print(f"   🧬 Vector Store: Stored event '{event_id}' — {event_text[:60]}...")
            return event_id
            
        except Exception as e:
            print(f"   ⚠️ Vector Store: Failed to store event ({e})")
            return None
    
    def find_similar(self, query: str, top_k: int = 5) -> list:
        """
        Find similar adverse events in the vector store.
        Used for zero-day / unknown side effect clustering.
        
        Args:
            query: Text description to search for similar events
            top_k: Number of similar events to return
            
        Returns:
            list: Similar events with distances and metadata
        """
        if not self._initialized:
            return []
        
        try:
            count = self._collection.count()
            if count == 0:
                return []
            
            actual_k = min(top_k, count)
            
            if self.embedder:
                # Cloud embeddings use embed_query
                query_embedding = self.embedder.embed_query(query)
                results = self._collection.query(
                    query_embeddings=[query_embedding],
                    n_results=actual_k
                )


            else:
                results = self._collection.query(
                    query_texts=[query],
                    n_results=actual_k
                )
            
            # Format results
            similar_events = []
            if results and results['ids'] and results['ids'][0]:
                for i, event_id in enumerate(results['ids'][0]):
                    similar_events.append({
                        "id": event_id,
                        "document": results['documents'][0][i] if results['documents'] else "",
                        "distance": results['distances'][0][i] if results.get('distances') else None,
                        "metadata": results['metadatas'][0][i] if results['metadatas'] else {}
                    })
            
            return similar_events
            
        except Exception as e:
            print(f"   ⚠️ Vector Store: Search failed ({e})")
            return []
    
    def get_cluster_summary(self) -> dict:
        """Get summary statistics of the vector store."""
        if not self._initialized:
            return {"status": "disabled", "count": 0}
        
        try:
            count = self._collection.count()
            return {
                "status": "active",
                "count": count,
                "collection": "adverse_events"
            }
        except Exception as e:
            return {"status": "error", "error": str(e), "count": 0}


# Module-level singleton
_store = None

def get_vector_store() -> AdverseEventVectorStore:
    """Get or create the singleton vector store instance."""
    global _store
    if _store is None:
        _store = AdverseEventVectorStore()
    return _store
