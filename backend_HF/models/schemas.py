from pydantic import BaseModel
from typing import List, Optional

# Feedback API Request Schema
class FeedbackRequest(BaseModel):
    session_id: str
    was_successful: bool
    user_rating: Optional[int] = 5
    repair_duration: Optional[int] = 0

# Adaptive Solution Request Schema
class SolutionRequest(BaseModel):
    session_id: str
    query: Optional[str] = None

# Conversational Chat Request Schemas
class ChatMessage(BaseModel):
    role: str # 'user' or 'model'
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
