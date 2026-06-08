import os
from typing import List, Dict, Any
from backend_HF.rag.vector_store import vector_store

class DocumentProcessor:
    def __init__(self, base_kb_dir: str = None):
        if base_kb_dir is None:
            # Find the absolute path to 'knowledge-base' relative to this file
            current_dir = os.path.dirname(os.path.abspath(__file__)) # backend_HF/rag/
            root_dir = os.path.dirname(os.path.dirname(current_dir)) # Smart Technician Assistant/
            self.base_kb_dir = os.path.join(root_dir, "knowledge-base")
        else:
            self.base_kb_dir = os.path.abspath(base_kb_dir)

    def chunk_text(self, text: str, chunk_size: int = 800, overlap: int = 100) -> List[str]:
        """
        Split a block of text into chunks with overlapping borders.
        """
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            start = end - overlap
        return chunks

    def process_kb(self):
        """
        Scan and process all document categories.
        """
        if not os.path.exists(self.base_kb_dir):
            print(f"[RAG] Base knowledge base directory not found at {self.base_kb_dir}")
            return
            
        print("[RAG] Starting knowledge base indexing...")
        vector_store.clear_database()
        
        folders = ["manuals", "sops", "repair-guides"]
        all_chunks = []
        
        for folder in folders:
            folder_path = os.path.join(self.base_kb_dir, folder)
            if not os.path.exists(folder_path):
                print(f"[RAG] Subdirectory {folder_path} does not exist. Skipping.")
                continue
                
            for file_name in os.listdir(folder_path):
                if file_name.endswith(".txt") or file_name.endswith(".pdf"):
                    file_path = os.path.join(folder_path, file_name)
                    try:
                        # Check magic bytes to see if it's a PDF
                        with open(file_path, "rb") as f:
                            header = f.read(4)
                            
                        if header == b"%PDF":
                            if os.path.getsize(file_path) > 5 * 1024 * 1024:
                                print(f"[RAG] Skipping large PDF file {file_name} to prevent blocking startup.")
                                continue
                            from pypdf import PdfReader
                            reader = PdfReader(file_path)
                            content = "\n".join([page.extract_text() for page in reader.pages if page.extract_text()])
                        else:
                            with open(file_path, "r", encoding="utf-8") as f:
                                content = f.read()
                            
                        # Auto-register product details in DB if it's in the 'manuals' category
                        if folder == "manuals":
                            import re
                            from backend_HF.database.db_service import db
                            
                            model_number = None
                            product_name = None
                            manufacturer = None
                            
                            first_few_lines = "\n".join(content.split("\n")[:10])
                            # Match model number
                            model_match = re.search(r'MODEL\s+([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*)', first_few_lines, re.IGNORECASE)
                            if model_match:
                                model_number = model_match.group(1).strip()
                                
                            # Match product name
                            title_match = re.search(r'===\s*([^:]+)\s*:', first_few_lines)
                            if title_match:
                                product_name = title_match.group(1).strip()
                            else:
                                product_name = file_name.replace("_manual.txt", "").replace(".txt", "").upper()
                                
                            # Defaults if parsing fails
                            if not model_number:
                                base_no_ext = file_name.replace("_manual", "").replace(".txt", "").replace(".pdf", "")
                                model_number = base_no_ext.upper().replace("-", " ").replace("_", " ")
                            
                            # Enforce suffix isolation for crawled manuals
                            if "_crawled" in file_name.lower():
                                if not model_number.endswith("_CRAWLED"):
                                    model_number = f"{model_number}_CRAWLED"
                            
                            if not product_name:
                                product_name = f"{model_number} Manual"
                                
                            if not manufacturer:
                                man_match = re.search(r'manufacturer:\s*([^\n]+)', first_few_lines, re.IGNORECASE)
                                manufacturer = man_match.group(1).strip() if man_match else "Standard"
                                
                            # Register in DB
                            db.add_product({
                                "product_name": product_name,
                                "manufacturer": manufacturer,
                                "model_number": model_number,
                                "manual_filename": file_name,
                                "description": f"Auto-registered manual from {file_name}"
                            })
                            
                        # Chunk the manual content
                        chunks = self.chunk_text(content)
                        for idx, chunk in enumerate(chunks):
                            all_chunks.append({
                                "text": f"Source: {file_name} | {chunk.strip()}",
                                "source_file": file_name,
                                "category": folder
                            })
                    except Exception as e:
                        print(f"[RAG] Error reading file {file_name}: {e}")
                        
        if all_chunks:
            try:
                vector_store.add_chunks(all_chunks)
                print("[RAG] Knowledge base indexing complete!")
            except Exception as e:
                print(f"[RAG] Knowledge base indexing failed: {e}")
        else:
            print("[RAG] No document chunks found to index.")

processor = DocumentProcessor()
if __name__ == "__main__":
    processor.process_kb()
