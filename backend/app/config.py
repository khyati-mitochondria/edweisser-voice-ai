import os

from dotenv import load_dotenv

load_dotenv()

SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# Which chat backend to use: "anthropic", "openai" or "openrouter" (default). Lets the
# whole app switch providers via one env var without code changes. Defaults
# to openrouter since the Anthropic account is currently out of credits --
# both text chat and voice calls share this one setting.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openrouter")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "inclusionai/ling-3.1-flash")

# The Sarvam TTS voice. Single source of truth: the TTS session and the system
# prompt both read it, because in Hindi (and Marathi, Gujarati, Punjabi...) the
# speaker's own gender changes verb forms -- a female voice saying "kar sakta
# hoon" sounds wrong, so the persona's gender in the prompt has to match.
TTS_SPEAKER = os.environ.get("TTS_SPEAKER", "ritu")
_FEMALE_SPEAKERS = {
    "ritu", "priya", "neha", "pooja", "simran", "kavya", "ishita", "shreya",
    "roopa", "tanya", "shruti", "suhani", "kavitha", "rupali",
}
# Derived from the speaker; set PERSONA_GENDER=male|female to override (e.g.
# if a voice is added to Sarvam's lineup that isn't in the list above).
PERSONA_GENDER = os.environ.get(
    "PERSONA_GENDER", "female" if TTS_SPEAKER.lower() in _FEMALE_SPEAKERS else "male"
).lower()

# Where complaint escalations get emailed. Real delivery doesn't happen yet
# (see tools/email_tool.py) so any placeholder is fine until Gmail creds land.
COMPLAINT_NOTIFY_EMAIL = os.environ.get("COMPLAINT_NOTIFY_EMAIL", "complaints-demo@example.com")
