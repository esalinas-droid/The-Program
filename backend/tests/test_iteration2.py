"""Backend tests for iteration 2: analytics, substitutions, core endpoints"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')


@pytest.fixture
def client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestCore:
    """Core API health"""

    def test_root(self, client):
        r = client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert "The Program" in data.get("message", "")

    def test_profile_get(self, client):
        r = client.get(f"{BASE_URL}/api/profile")
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            data = r.json()
            assert "name" in data
            assert "_id" not in data

    def test_seed(self, client):
        r = client.post(f"{BASE_URL}/api/seed")
        assert r.status_code == 200
        data = r.json()
        assert "seeded" in data


class TestAnalytics:
    """Analytics endpoints"""

    def test_analytics_overview(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/overview")
        assert r.status_code == 200
        data = r.json()
        assert "trainingDays" in data
        assert "avgRPE" in data
        assert "compliance" in data
        assert "prsThisBlock" in data

    def test_analytics_volume(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/volume")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_analytics_pain(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/pain")
        assert r.status_code == 200
        data = r.json()
        assert "hasPain" in data

    def test_analytics_compliance(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/compliance")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)


class TestSubstitutions:
    """Substitution log endpoints"""

    def test_get_substitutions(self, client):
        r = client.get(f"{BASE_URL}/api/substitutions")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_post_substitution(self, client):
        payload = {
            "date": "2026-01-15",
            "week": 1,
            "day": "Monday",
            "sessionType": "Max Effort Upper",
            "originalExercise": "Floor Press",
            "replacementExercise": "Bench Press",
            "reason": "Equipment unavailable"
        }
        r = client.post(f"{BASE_URL}/api/substitutions", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["originalExercise"] == "Floor Press"
        assert data["replacementExercise"] == "Bench Press"
        assert "_id" not in data
        assert "id" in data

    def test_get_substitutions_by_week(self, client):
        r = client.get(f"{BASE_URL}/api/substitutions?week=1")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)


class TestPRs:
    """PR endpoints"""

    def test_get_prs(self, client):
        r = client.get(f"{BASE_URL}/api/prs")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_prs_bests_overview(self, client):
        r = client.get(f"{BASE_URL}/api/prs/bests/overview")
        assert r.status_code == 200
        data = r.json()
        assert "squat" in data
        assert "press" in data
        assert "pull" in data

    def test_pr_history_by_exercise(self, client):
        r = client.get(f"{BASE_URL}/api/prs/Back%20Squat")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)


class TestLog:
    """Workout log endpoints"""

    def test_get_log(self, client):
        r = client.get(f"{BASE_URL}/api/log")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_week_stats(self, client):
        r = client.get(f"{BASE_URL}/api/log/stats/week/1")
        assert r.status_code == 200
        data = r.json()
        assert "avgPain" in data
        assert "avgRPE" in data
        assert "completionRate" in data
