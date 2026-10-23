from ..config import settings


def is_safety_moderator(user: dict) -> bool:
    configured_emails = {
        email.strip().casefold()
        for email in settings.SAFETY_MODERATOR_EMAILS.split(",")
        if email.strip()
    }
    return (user.get("email") or "").strip().casefold() in configured_emails
