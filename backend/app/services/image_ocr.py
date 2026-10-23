import asyncio
import base64
import binascii
import os
import shutil
import tempfile
from pathlib import Path


MAX_IMAGE_BYTES = 8 * 1024 * 1024
_MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
    "image/bmp": ".bmp",
}


def _tesseract_command() -> str | None:
    configured = os.getenv("TESSERACT_CMD")
    if configured and os.path.isfile(configured):
        return configured
    command = shutil.which("tesseract")
    if command:
        return command
    windows_default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    return windows_default if os.path.isfile(windows_default) else None


async def extract_text_from_image_data(image_data: str) -> str:
    """OCR a data URI without fetching user-controlled URLs."""
    if not isinstance(image_data, str) or not image_data.startswith("data:"):
        raise ValueError("Image must be provided as a base64 data URI")
    if len(image_data) > (MAX_IMAGE_BYTES * 4 // 3) + 256:
        raise ValueError("Image must be 8 MB or smaller")

    try:
        header, encoded = image_data.split(",", 1)
        mime_type = header[5:].split(";", 1)[0].lower()
    except ValueError as exc:
        raise ValueError("Invalid image data URI") from exc

    extension = _MIME_EXTENSIONS.get(mime_type)
    if not extension or ";base64" not in header.lower():
        raise ValueError("Supported image formats are JPEG, PNG, WEBP, TIFF, and BMP")

    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 image data") from exc
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("Image must be between 1 byte and 8 MB")

    command = _tesseract_command()
    if not command:
        raise RuntimeError("Tesseract OCR is not installed")

    with tempfile.TemporaryDirectory(prefix="cyberbully_ocr_") as temp_dir:
        image_path = Path(temp_dir) / f"upload{extension}"
        image_path.write_bytes(image_bytes)
        process = await asyncio.create_subprocess_exec(
            command,
            str(image_path),
            "stdout",
            "--psm",
            "6",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=15)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise RuntimeError("OCR timed out")
        if process.returncode != 0:
            raise RuntimeError("Tesseract could not read this image")
        return stdout.decode("utf-8", errors="replace").strip()
