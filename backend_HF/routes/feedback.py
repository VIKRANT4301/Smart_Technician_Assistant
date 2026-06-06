from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.database import db

router = APIRouter(prefix="", tags=["Feedback"])

class FeedbackRequest(BaseModel):
    session_id: str
    was_successful: bool
    user_rating: Optional[int] = 5
    repair_duration: Optional[int] = 0

@router.post("/feedback")
async def record_feedback(req: FeedbackRequest):
    try:
        # Retrieve the session
        session = db.get_session(req.session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Active troubleshooting session {req.session_id} not found.")

        # Update session failed steps if repair unsuccessful
        if not req.was_successful:
            suggested = session.get("suggested_steps", [])
            failed_accumulated = session.get("failed_steps", [])
            
            # Add suggested steps to the failed list (avoiding duplicates)
            for step in suggested:
                if step not in failed_accumulated:
                    failed_accumulated.append(step)
            
            session["failed_steps"] = failed_accumulated
            db.create_or_update_session(session)
            print(f"[Feedback] Updated session {req.session_id} with failed steps: {failed_accumulated}")

        # Log feedback into the analytics table
        db.add_feedback({
            "session_id": req.session_id,
            "user_issue": session.get("detected_issue", "Unknown"),
            "suggested_repair": ", ".join(session.get("suggested_steps", [])),
            "was_successful": req.was_successful,
            "repair_duration": req.repair_duration,
            "user_rating": req.user_rating
        })

        return {
            "status": "success",
            "message": "Repair feedback registered successfully.",
            "session_id": req.session_id,
            "was_successful": req.was_successful,
            "failed_steps_count": len(session.get("failed_steps", []))
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[Feedback] Error recording feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))
