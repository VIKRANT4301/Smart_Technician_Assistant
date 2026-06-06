from fastapi import APIRouter
from backend_HF.models.schemas import FeedbackRequest
from backend_HF.feedback.feedback_service import feedback_service

router = APIRouter(prefix="", tags=["Feedback"])

@router.post("/feedback")
async def record_feedback(req: FeedbackRequest):
    return feedback_service.process_repair_feedback(
        session_id=req.session_id,
        was_successful=req.was_successful,
        user_rating=req.user_rating,
        repair_duration=req.repair_duration
    )
