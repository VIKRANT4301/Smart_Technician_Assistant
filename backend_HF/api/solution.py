from fastapi import APIRouter
from backend_HF.models.schemas import SolutionRequest
from backend_HF.feedback.feedback_service import feedback_service

router = APIRouter(prefix="", tags=["Solution"])

@router.post("/generate-solution")
async def generate_alternative_solution(req: SolutionRequest):
    return feedback_service.get_alternative_solution(
        session_id=req.session_id,
        query=req.query
    )
