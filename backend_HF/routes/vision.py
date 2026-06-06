from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.utils.file_handler import file_handler
from backend.vision.analyzer import vision_analyzer

router = APIRouter(prefix="", tags=["Vision"])

@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")
        
    try:
        # Save image
        filepath = file_handler.save_upload(file, subfolder="images")
        
        # Analyze image
        analysis = vision_analyzer.analyze_image(filepath)
        
        # Return results along with relative URL path of the image
        relative_url = file_handler.get_relative_url(filepath)
        return {
            "image_url": relative_url,
            "detected_issue": analysis.get("detected_issue"),
            "confidence": analysis.get("confidence"),
            "visual_findings": analysis.get("visual_findings")
        }
    except Exception as e:
        print(f"[Routes] Error in /upload-image: {e}")
        raise HTTPException(status_code=500, detail=str(e))
