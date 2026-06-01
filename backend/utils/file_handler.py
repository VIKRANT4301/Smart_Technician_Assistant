import os
import uuid
import shutil
from fastapi import UploadFile
from backend.config import config

class FileHandler:
    def __init__(self):
        self.upload_dir = os.path.join(config.STATIC_DIR, "uploads")
        os.makedirs(self.upload_dir, exist_ok=True)

    def save_upload(self, upload_file: UploadFile, subfolder: str = "images") -> str:
        """
        Saves an uploaded file to a local subdirectory.
        Returns the absolute filepath of the saved file.
        """
        folder = os.path.join(self.upload_dir, subfolder)
        os.makedirs(folder, exist_ok=True)
        
        # Keep original extension or fallback to png/mp3
        ext = os.path.splitext(upload_file.filename)[1]
        if not ext:
            if subfolder == "images":
                ext = ".jpg"
            elif subfolder == "audio":
                ext = ".wav"
            else:
                ext = ".bin"

        unique_name = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(folder, unique_name)
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
            
        print(f"[FileHandler] Saved upload to {filepath}")
        return filepath

    def get_relative_url(self, filepath: str) -> str:
        """
        Convert an absolute filepath in the static dir to a relative url path.
        """
        normalized_path = os.path.normpath(filepath)
        normalized_static = os.path.normpath(config.STATIC_DIR)
        
        if normalized_path.startswith(normalized_static):
            rel = os.path.relpath(normalized_path, normalized_static)
            # URL paths should use forward slashes even on Windows
            return "/static/" + rel.replace("\\", "/")
        return ""

file_handler = FileHandler()
