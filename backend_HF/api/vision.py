from fastapi import APIRouter, UploadFile, File, HTTPException
from backend_HF.utils.file_handler import file_handler
from backend_HF.vision.analyzer import vision_analyzer

router = APIRouter(prefix="", tags=["Vision"])

@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")
        
    try:
        filepath = file_handler.save_upload(file, subfolder="images")
        analysis = vision_analyzer.analyze_image(filepath)
        relative_url = file_handler.get_relative_url(filepath)
        
        annotated_path = analysis.get("annotated_image_path", filepath)
        annotated_url = file_handler.get_relative_url(annotated_path)
        
        return {
            "image_url": annotated_url,
            "detected_issue": analysis.get("detected_issue"),
            "confidence": analysis.get("confidence"),
            "visual_findings": analysis.get("visual_findings")
        }
    except Exception as e:
        print(f"[API Vision] Error in /upload-image: {e}")
        raise HTTPException(status_code=500, detail=str(e))
