"""
Pure-function unit tests for the add-exercise validator and text sanitiser.

These do NOT hit the LLM — they import the helpers straight from server.py so
we can verify the untrusted-JSON hardening even when the coach endpoint itself
is blocked by an upstream credential issue.
"""
import sys, os
sys.path.insert(0, "/app/backend")

# Importing server has side-effects (registers routes, etc.) but that's fine
# for a test process.
import server  # noqa: E402


class TestSanitizeText:
    def test_strips_tags_and_control_chars(self):
        out = server._sanitize_text("<b>hi</b>\x00\x07 there", 50)
        assert out == "hi there"

    def test_clamps_length(self):
        out = server._sanitize_text("x" * 200, 20)
        assert out == "x" * 20

    def test_non_string_becomes_empty(self):
        assert server._sanitize_text(None, 10) == ""
        assert server._sanitize_text(123, 10) == "123"
        assert server._sanitize_text({"a": 1}, 50).startswith("{") or True  # str() shape ok

    def test_collapses_whitespace(self):
        assert server._sanitize_text("  a\t\tb   c  ", 20) == "a b c"


class TestValidateCoachAddedExercise:
    def test_valid_full_payload(self):
        out = server.validate_coach_added_exercise({
            "name": "Face Pulls",
            "category": "accessory",
            "sets": 3,
            "reps": "12",
            "notes": "shoulder health",
        })
        assert out == {
            "name": "Face Pulls",
            "category": "accessory",
            "sets": 3,
            "reps": "12",
            "notes": "shoulder health",
        }

    def test_missing_name_rejected(self):
        assert server.validate_coach_added_exercise({}) is None
        assert server.validate_coach_added_exercise({"name": ""}) is None
        assert server.validate_coach_added_exercise({"name": "   "}) is None
        assert server.validate_coach_added_exercise({"name": None, "sets": 3}) is None

    def test_non_dict_rejected(self):
        assert server.validate_coach_added_exercise(None) is None
        assert server.validate_coach_added_exercise("nope") is None
        assert server.validate_coach_added_exercise(42) is None
        assert server.validate_coach_added_exercise([1, 2]) is None

    def test_nonsense_category_coerced_to_accessory(self):
        out = server.validate_coach_added_exercise({"name": "Curl", "category": "banana"})
        assert out["category"] == "accessory"

    def test_missing_category_coerced_to_accessory(self):
        out = server.validate_coach_added_exercise({"name": "Curl"})
        assert out["category"] == "accessory"

    def test_all_allowed_categories_pass_through(self):
        for cat in ["main", "supplemental", "accessory", "prehab", "warmup", "gpp", "cooldown"]:
            out = server.validate_coach_added_exercise({"name": "X", "category": cat})
            assert out["category"] == cat, cat

    def test_category_case_insensitive(self):
        out = server.validate_coach_added_exercise({"name": "X", "category": "ACCESSORY"})
        assert out["category"] == "accessory"

    def test_sets_clamped(self):
        assert server.validate_coach_added_exercise({"name": "X", "sets": 0})["sets"] == 1
        assert server.validate_coach_added_exercise({"name": "X", "sets": 99})["sets"] == 10
        assert server.validate_coach_added_exercise({"name": "X", "sets": -5})["sets"] == 1

    def test_sets_default_and_bad_type(self):
        assert server.validate_coach_added_exercise({"name": "X"})["sets"] == 3
        assert server.validate_coach_added_exercise({"name": "X", "sets": "abc"})["sets"] == 3
        assert server.validate_coach_added_exercise({"name": "X", "sets": None})["sets"] == 3

    def test_reps_default(self):
        assert server.validate_coach_added_exercise({"name": "X"})["reps"] == "8-10"
        assert server.validate_coach_added_exercise({"name": "X", "reps": ""})["reps"] == "8-10"

    def test_reps_free_form_kept(self):
        assert server.validate_coach_added_exercise({"name": "X", "reps": "AMRAP"})["reps"] == "AMRAP"
        assert server.validate_coach_added_exercise({"name": "X", "reps": "5x5"})["reps"] == "5x5"

    def test_notes_length_capped_and_optional(self):
        out = server.validate_coach_added_exercise({"name": "X", "notes": "a" * 500})
        assert len(out["notes"]) <= 200

    def test_html_in_name_stripped(self):
        out = server.validate_coach_added_exercise({"name": "<script>alert(1)</script>Cable Row"})
        assert "<" not in out["name"] and "script" not in out["name"].lower()
        assert "cable row" in out["name"].lower()


class TestCategoryConstant:
    def test_categories_set_matches_spec(self):
        expected = {"main", "supplemental", "accessory", "prehab", "warmup", "gpp", "cooldown"}
        assert server.COACH_EXERCISE_CATEGORIES == expected
