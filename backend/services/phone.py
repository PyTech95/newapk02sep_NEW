"""Phone-number normalization for OTP.

Indian mobile numbers are the primary case, but valid international numbers
are preserved. All numbers are normalized to E.164 (e.g. +919876543210).
"""
import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberFormat


class InvalidPhone(ValueError):
    """Raised when a phone number cannot be parsed/validated."""


def normalize_phone(value: str) -> str:
    """Return the E.164 form of `value`.

    A bare national number (e.g. 9876543210) is interpreted as Indian.
    Numbers that already carry a country code (+, 00 or 91...) are parsed
    as-is so international numbers keep working.
    """
    raw = (value or "").strip().replace(" ", "").replace("-", "")
    if not raw:
        raise InvalidPhone("empty phone")

    # If it looks international (starts with + or 00) parse without a region
    # so we don't wrongly force +91.
    region = None if raw.startswith("+") or raw.startswith("00") else "IN"
    try:
        parsed = phonenumbers.parse(raw, region)
    except NumberParseException as exc:
        raise InvalidPhone(str(exc)) from exc

    if not phonenumbers.is_valid_number(parsed):
        raise InvalidPhone("invalid number")

    return phonenumbers.format_number(parsed, PhoneNumberFormat.E164)


def mask_phone(phone: str) -> str:
    """Redact a phone number for safe logging: +9198***10."""
    if not phone or len(phone) <= 5:
        return "***"
    return phone[:5] + "***" + phone[-2:]
