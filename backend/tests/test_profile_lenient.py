"""
Pure tests for _profile_from_mongo_lenient (server.py). No live server needed.

The "Could not switch mode — check your connection" bug: profile docs written
by earlier schema generations can hold nulls or wrong-typed values that the
strict AthleteProfile model rejects. Every GET /profile client swallows the
resulting 500 (local-storage fallback), so the breakage only ever surfaced on
POST /profile/switch-mode. The lenient parser must accept such docs by
dropping nulls first, then dropping only the offending fields, while keeping
every valid field intact.

Run:  pytest tests/test_profile_lenient.py -v
"""
import pytest

from server import AthleteProfile, _profile_from_mongo_lenient


def _base_doc(**overrides):
    doc = {
        "userId": "test-user-lenient",
        "name": "Test Athlete",
        "units": "lbs",
        "training_mode": "program",
    }
    doc.update(overrides)
    return doc


class TestLenientProfileParse:
    def test_valid_doc_passes_through_unchanged(self):
        p = _profile_from_mongo_lenient(_base_doc(currentWeek=7))
        assert p.name == "Test Athlete"
        assert p.currentWeek == 7
        assert p.training_mode == "program"

    def test_nulls_in_non_optional_fields_fall_back_to_defaults(self):
        # These nulls make the STRICT parse raise — proving the bug is real…
        doc = _base_doc(name=None, preferredDays=None, sleepHours=None)
        with pytest.raises(Exception):
            AthleteProfile.from_mongo(dict(doc))
        # …and the lenient parse absorbs them via model defaults.
        p = _profile_from_mongo_lenient(doc)
        assert p.name == ""
        assert p.preferredDays == []
        assert p.sleepHours == 7.0

    def test_wrong_typed_fields_are_dropped_not_fatal(self):
        doc = _base_doc(sleepHours="seven-ish", trainingDaysCount={"bogus": True})
        p = _profile_from_mongo_lenient(doc)
        assert p.sleepHours == 7.0        # dropped → default
        assert p.trainingDaysCount == 4   # dropped → default
        assert p.name == "Test Athlete"   # good fields survive

    def test_good_fields_survive_next_to_bad_ones(self):
        doc = _base_doc(training_mode="free", notifications="not-a-dict")
        p = _profile_from_mongo_lenient(doc)
        assert p.training_mode == "free"
