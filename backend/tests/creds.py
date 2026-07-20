"""
Test-credential lookup for live-API tests.

Reads /app/memory/test_credentials.md — a LOCAL, UNTRACKED (gitignored) file —
so no working password ever appears in tracked test code. Table rows look like:
    | Label | email@test.com | password | notes |
"""
from pathlib import Path

CRED_FILE = Path(__file__).resolve().parents[2] / "memory" / "test_credentials.md"


def password_for(email: str) -> str:
    """Return the current password for an account listed in test_credentials.md."""
    for line in CRED_FILE.read_text().splitlines():
        if email in line and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            for idx, cell in enumerate(cells):
                if cell == email and idx + 1 < len(cells):
                    return cells[idx + 1]
    raise KeyError(f"No credentials found for {email} in {CRED_FILE}")
