from fastapi import APIRouter, HTTPException
from backend.database.db_service import db

router = APIRouter(prefix="", tags=["History"])

@router.get("/history")
@router.get("/repair-history")
async def get_repair_history():
    try:
        records = db.get_history()
        feedbacks = db.get_all_feedback()
        return {
            "status": "success",
            "count": len(records),
            "data": records,
            "feedback_history": feedbacks
        }
    except Exception as e:
        print(f"[API History] Error fetching history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
