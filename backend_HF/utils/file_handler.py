import os
import uuid
import shutil
from fastapi import UploadFile
from backend_HF.core.config import config

class FileHandler:
    def __init__(self):
        # Resolve static directory relative to root workspace
        db_url_path = config.STATIC_DIR
        if os.path.isabs(db_url_path):
            self.upload_dir = os.path.join(db_url_path, "uploads")
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            root_dir = os.path.dirname(os.path.dirname(current_dir))
            self.upload_dir = os.path.join(root_dir, db_url_path, "uploads")
            
        os.makedirs(self.upload_dir, exist_ok=True)
        self._init_supabase()

    def _init_supabase(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")
        self.supabase_bucket = os.getenv("SUPABASE_BUCKET", "maintenance-assets")
        
        self.supabase_client = None
        if self.supabase_url and self.supabase_key:
            try:
                from supabase import create_client
                self.supabase_client = create_client(self.supabase_url, self.supabase_key)
                print(f"[FileHandler] Supabase Storage client connected to bucket: {self.supabase_bucket}")
            except Exception as e:
                print(f"[FileHandler] Supabase Storage initialization bypassed: {e}")

    def save_upload(self, upload_file: UploadFile, subfolder: str = "images") -> str:
        """
        Saves an uploaded file. If Supabase is active, uploads directly to Supabase Storage.
        Otherwise, saves to local disk and returns the local filepath.
        """
        ext = os.path.splitext(upload_file.filename or "")[1]
        if not ext:
            if subfolder == "images":
                ext = ".jpg"
            elif subfolder == "audio":
                ext = ".wav"
            else:
                ext = ".bin"

        unique_name = f"{uuid.uuid4().hex}{ext}"

        # 1. Supabase Upload Fallback
        if self.supabase_client:
            try:
                upload_file.file.seek(0)
                file_bytes = upload_file.file.read()
                
                bucket_path = f"{subfolder}/{unique_name}"
                self.supabase_client.storage.from_(self.supabase_bucket).upload(
                    path=bucket_path,
                    file=file_bytes,
                    file_options={"content-type": upload_file.content_type or "application/octet-stream"}
                )
                public_url = self.supabase_client.storage.from_(self.supabase_bucket).get_public_url(bucket_path)
                print(f"[FileHandler] Uploaded to Supabase Storage: {public_url}")
                return public_url
            except Exception as e:
                print(f"[FileHandler] Supabase Storage upload failed: {e}. Falling back to disk storage.")

        # 2. Local Disk Fallback
        folder = os.path.join(self.upload_dir, subfolder)
        os.makedirs(folder, exist_ok=True)
        filepath = os.path.join(folder, unique_name)
        
        # Seek back to 0 in case it was read for Supabase check
        upload_file.file.seek(0)
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
            
        print(f"[FileHandler] Saved upload locally to {filepath}")
        return filepath

    def get_relative_url(self, filepath: str) -> str:
        """
        Convert an absolute filepath in the static dir to a relative url path.
        Returns the path as-is if it is already a public URL.
        """
        if not filepath:
            return ""
        if filepath.startswith("http://") or filepath.startswith("https://"):
            return filepath
            
        normalized_path = os.path.normpath(filepath)
        
        static_dir = config.STATIC_DIR
        if not os.path.isabs(static_dir):
            current_dir = os.path.dirname(os.path.abspath(__file__))
            root_dir = os.path.dirname(os.path.dirname(current_dir))
            static_dir = os.path.join(root_dir, static_dir)
            
        normalized_static = os.path.normpath(static_dir)
        
        if normalized_path.startswith(normalized_static):
            rel = os.path.relpath(normalized_path, normalized_static)
            return "/static/" + rel.replace("\\", "/")
        return ""

file_handler = FileHandler()
