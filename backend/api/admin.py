import os
import re
from html.parser import HTMLParser
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from backend.database.db_service import db
from backend.rag.document_processor import processor
from backend.rag.vector_store import vector_store

router = APIRouter(prefix="/admin", tags=["Admin Panel"])

class ProductSchema(BaseModel):
    product_name: str
    manufacturer: str
    model_number: str
    manual_filename: str
    description: Optional[str] = ""

@router.get("/products")
async def list_products():
    try:
        return db.get_all_products()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/products")
async def create_product(prod: ProductSchema):
    try:
        product_id = db.add_product(prod.dict())
        return {"status": "success", "product_id": product_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/products/{id}")
async def delete_product(id: int):
    try:
        db.delete_product(id)
        return {"status": "success", "message": f"Product with ID {id} deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-manual")
async def upload_manual(
    file: UploadFile = File(...),
    category: str = Form("manuals"),
    product_name: Optional[str] = Form(None),
    manufacturer: Optional[str] = Form(None),
    model_number: Optional[str] = Form(None),
    description: Optional[str] = Form("")
):
    if category not in ["manuals", "sops", "repair-guides"]:
        raise HTTPException(status_code=400, detail="Invalid category. Must be 'manuals', 'sops', or 'repair-guides'.")
    if not (file.filename.endswith(".txt") or file.filename.endswith(".pdf")):
        raise HTTPException(status_code=400, detail="Only .txt and .pdf files are supported.")
        
    try:
        # Define destination path in the knowledge base
        kb_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge-base", category))
        os.makedirs(kb_dir, exist_ok=True)
        
        filepath = os.path.join(kb_dir, file.filename)
        with open(filepath, "wb") as f:
            f.write(await file.read())
            
        # Register product in database if metadata is provided
        if product_name and manufacturer and model_number:
            db.add_product({
                "product_name": product_name,
                "manufacturer": manufacturer,
                "model_number": model_number,
                "manual_filename": file.filename,
                "description": description
            })
            
        # Trigger knowledge base re-indexing
        processor.process_kb()
        
        return {
            "status": "success",
            "message": f"Successfully uploaded and indexed manual: {file.filename} under category: {category}."
        }
    except Exception as e:
        print(f"[Admin API] Error uploading manual: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/manuals/{category}/{filename}")
async def delete_manual(category: str, filename: str):
    if category not in ["manuals", "sops", "repair-guides"]:
        raise HTTPException(status_code=400, detail="Invalid category. Must be 'manuals', 'sops', or 'repair-guides'.")
    try:
        kb_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge-base", category))
        filepath = os.path.join(kb_dir, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            
        # Delete chunks from sqlite
        with vector_store._get_connection() as conn:
            conn.execute("DELETE FROM document_chunks WHERE source_file = ?", (filename,))
            conn.commit()
            
        return {"status": "success", "message": f"Manual {filename} removed and deleted from index."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics")
async def get_analytics():
    try:
        summary = db.get_analytics_summary()
        unresolved = db.get_unresolved_cases()
        return {
            "summary": summary,
            "unresolved_cases": unresolved
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TextManualSchema(BaseModel):
    product_name: str
    manufacturer: str
    model_number: str
    manual_text: str
    description: Optional[str] = ""
    category: Optional[str] = "manuals"

@router.post("/add-manual-text")
async def add_manual_text(payload: TextManualSchema):
    if payload.category not in ["manuals", "sops", "repair-guides"]:
        raise HTTPException(status_code=400, detail="Invalid category. Must be 'manuals', 'sops', or 'repair-guides'.")
    if not payload.manual_text.strip():
        raise HTTPException(status_code=400, detail="Manual text content cannot be empty.")
        
    try:
        # Generate safe filename based on model number
        safe_model = re.sub(r'[^a-zA-Z0-9_-]', '_', payload.model_number.lower())
        filename = f"{safe_model}_manual.txt"
        
        kb_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge-base", payload.category))
        os.makedirs(kb_dir, exist_ok=True)
        
        filepath = os.path.join(kb_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(payload.manual_text)
            
        # Register product in database
        db.add_product({
            "product_name": payload.product_name,
            "manufacturer": payload.manufacturer,
            "model_number": payload.model_number,
            "manual_filename": filename,
            "description": payload.description
        })
        
        # Trigger knowledge base re-indexing
        processor.process_kb()
        
        return {
            "status": "success",
            "filename": filename,
            "message": f"Successfully created and indexed manual text for model {payload.model_number}."
        }
    except Exception as e:
        print(f"[Admin API] Error adding manual text: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from backend.utils.scraper import scrape_url


class UrlManualSchema(BaseModel):
    product_name: str
    manufacturer: str
    model_number: str
    url: str
    description: Optional[str] = ""
    category: Optional[str] = "manuals"

@router.post("/add-manual-url")
async def add_manual_url(payload: UrlManualSchema):
    if payload.category not in ["manuals", "sops", "repair-guides"]:
        raise HTTPException(status_code=400, detail="Invalid category. Must be 'manuals', 'sops', or 'repair-guides'.")
    if not payload.url.strip():
        raise HTTPException(status_code=400, detail="Manual URL cannot be empty.")
        
    try:
        raw_text = scrape_url(payload.url)
            
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract any text from the provided URL.")
            
        # Generate safe filename based on model number
        safe_model = re.sub(r'[^a-zA-Z0-9_-]', '_', payload.model_number.lower())
        filename = f"{safe_model}_manual.txt"
        
        kb_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge-base", payload.category))
        os.makedirs(kb_dir, exist_ok=True)
        
        filepath = os.path.join(kb_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(raw_text)
            
        # Register product in database
        db.add_product({
            "product_name": payload.product_name,
            "manufacturer": payload.manufacturer,
            "model_number": payload.model_number,
            "manual_filename": filename,
            "description": payload.description
        })
        
        # Trigger knowledge base re-indexing
        processor.process_kb()
        
        return {
            "status": "success",
            "filename": filename,
            "message": f"Successfully fetched, cleaned, and indexed manual from URL for model {payload.model_number}."
        }
    except Exception as e:
        print(f"[Admin API] Error adding manual from URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))
