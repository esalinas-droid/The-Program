"""
Authoritative inventory of per-user (userId-keyed) Mongo collections.

Both the delete-account purge (routers/auth.py) and the data export
(server.py _EXPORT_COLLECTIONS) derive their lists from USER_COLLECTIONS,
so the inventory can no longer drift between them — it already did once,
when the purge referenced collections that didn't exist while others were
silently skipped. When any new per-user collection is added to the backend,
add it HERE; deletion and export then pick it up automatically (subject to
the documented exclusions applied at each call site).

Deliberately absent:
  • password_resets — keyed by email, not userId. The delete-account purge
    handles it explicitly by the user's email.
  • users — the account record itself; deleted last by the purge.
"""

USER_COLLECTIONS = [
    "profile", "saved_plans", "log", "tracked_lifts", "pain_reports",
    "substitutions", "user_documents", "user_document_chunks",
    "conversations", "coach_memory", "coach_voice_transcriptions",
    "coach_voice_tts", "weekly_reviews", "session_ratings",
    "readiness_checks", "checkins", "calendar_overrides", "user_exercises",
    "rehab_protocols", "rehab_logs", "deload_history", "image_credits",
    "credit_transactions", "weekly_quests", "streak_freezes",
    "session_finishes", "session_added_exercises",
    "training_analytics", "llm_extractions",
]
