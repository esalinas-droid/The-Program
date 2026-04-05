"""
Tests for new calendar features:
- PUT /api/profile/preferred-days
- GET /api/calendar/events
- POST /api/calendar/reschedule
- DELETE /api/calendar/reschedule/{originalDate}
- POST /api/profile/intake with preferredDays
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

EMAIL = "user_a@theprogram.app"
PASSWORD = "StrongmanA123"

# Fresh user for intake test
FRESH_EMAIL = "fresh_user_c@test.com"
FRESH_PASSWORD = "TestC123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def fresh_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": FRESH_EMAIL, "password": FRESH_PASSWORD})
    assert r.status_code == 200, f"Fresh user login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def fresh_headers(fresh_token):
    return {"Authorization": f"Bearer {fresh_token}", "Content-Type": "application/json"}


class TestPreferredDays:
    """PUT /api/profile/preferred-days"""

    def test_set_preferred_days(self, auth_headers):
        r = requests.put(
            f"{BASE_URL}/api/profile/preferred-days",
            json={"preferredDays": ["monday", "wednesday", "friday"], "notificationHour": 8},
            headers=auth_headers,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        print("PASS: PUT preferred-days returns success=true")

    def test_set_preferred_days_invalid_day(self, auth_headers):
        r = requests.put(
            f"{BASE_URL}/api/profile/preferred-days",
            json={"preferredDays": ["funday"], "notificationHour": 8},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), f"Expected 400/422 for invalid day, got {r.status_code}"
        print(f"PASS: Invalid day rejected with {r.status_code}")


class TestCalendarEvents:
    """GET /api/calendar/events"""

    def test_get_events_returns_list(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/calendar/events",
            params={"start_date": "2026-01-01", "end_date": "2026-12-31"},
            headers=auth_headers,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert isinstance(data, (list, dict)), f"Expected list or dict response: {data}"
        # Extract events list if wrapped
        events = data if isinstance(data, list) else data.get("events", [])
        assert isinstance(events, list), f"Events should be a list: {data}"
        print(f"PASS: GET calendar/events returned {len(events)} events")
        return events

    def test_events_on_preferred_days(self, auth_headers):
        """After setting mon/wed/fri, events should land on those days"""
        # First set preferred days
        requests.put(
            f"{BASE_URL}/api/profile/preferred-days",
            json={"preferredDays": ["monday", "wednesday", "friday"], "notificationHour": 8},
            headers=auth_headers,
        )

        r = requests.get(
            f"{BASE_URL}/api/calendar/events",
            params={"start_date": "2026-01-01", "end_date": "2026-03-31"},
            headers=auth_headers,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        events = data if isinstance(data, list) else data.get("events", [])

        if len(events) == 0:
            pytest.skip("No events returned — plan may not be generated yet")

        allowed_days = {"Monday", "Wednesday", "Friday"}
        day_name_map = {0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday",
                        4: "Friday", 5: "Saturday", 6: "Sunday"}

        bad_events = []
        for ev in events[:30]:  # Check first 30
            date_str = ev.get("date", "")
            if not date_str:
                continue
            try:
                d = datetime.strptime(date_str[:10], "%Y-%m-%d")
                day_name = day_name_map[d.weekday()]
                if day_name not in allowed_days:
                    bad_events.append(f"{date_str} ({day_name})")
            except Exception:
                pass

        assert len(bad_events) == 0, f"Events on wrong days (expected Mon/Wed/Fri): {bad_events[:5]}"
        print(f"PASS: All checked events fall on Mon/Wed/Fri")


class TestReschedule:
    """POST /api/calendar/reschedule and DELETE"""

    def _get_first_future_event(self, headers):
        today = datetime.now().strftime("%Y-%m-%d")
        end = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
        r = requests.get(
            f"{BASE_URL}/api/calendar/events",
            params={"start_date": today, "end_date": end},
            headers=headers,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        events = data if isinstance(data, list) else data.get("events", [])
        future_events = [e for e in events if e.get("date", "") >= today]
        return future_events[0] if future_events else None

    def test_reschedule_session(self, auth_headers):
        event = self._get_first_future_event(auth_headers)
        if not event:
            pytest.skip("No future events to reschedule")

        original_date = event["date"][:10]
        # Pick a far future date to avoid conflicts
        new_date = (datetime.now() + timedelta(days=180)).strftime("%Y-%m-%d")

        r = requests.post(
            f"{BASE_URL}/api/calendar/reschedule",
            json={
                "originalDate": original_date,
                "newDate": new_date,
                "sessionType": event.get("sessionType", "training"),
                "reason": "TEST_reschedule",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        assert data.get("originalDate") == original_date or data.get("original_date") == original_date, \
            f"originalDate not in response: {data}"
        assert data.get("newDate") == new_date or data.get("new_date") == new_date, \
            f"newDate not in response: {data}"
        print(f"PASS: Reschedule {original_date} → {new_date}")

        # Store for subsequent tests
        TestReschedule._original_date = original_date
        TestReschedule._new_date = new_date

    def test_rescheduled_event_appears_on_new_date(self, auth_headers):
        if not hasattr(TestReschedule, "_new_date"):
            pytest.skip("Depends on test_reschedule_session")

        new_date = TestReschedule._new_date
        start = (datetime.strptime(new_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (datetime.strptime(new_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")

        r = requests.get(
            f"{BASE_URL}/api/calendar/events",
            params={"start_date": start, "end_date": end},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        events = data if isinstance(data, list) else data.get("events", [])

        matching = [e for e in events if e.get("date", "")[:10] == new_date]
        assert len(matching) > 0, f"No event found on new_date {new_date}: {events}"

        # Check isOverridden flag
        overridden = [e for e in matching if e.get("isOverridden") or e.get("is_overridden")]
        assert len(overridden) > 0, f"Rescheduled event missing isOverridden=true: {matching}"
        print(f"PASS: Rescheduled event on {new_date} with isOverridden=true")

    def test_original_date_no_longer_has_event(self, auth_headers):
        if not hasattr(TestReschedule, "_original_date"):
            pytest.skip("Depends on test_reschedule_session")

        orig_date = TestReschedule._original_date
        start = (datetime.strptime(orig_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (datetime.strptime(orig_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")

        r = requests.get(
            f"{BASE_URL}/api/calendar/events",
            params={"start_date": start, "end_date": end},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        events = data if isinstance(data, list) else data.get("events", [])
        matching = [e for e in events if e.get("date", "")[:10] == orig_date]
        assert len(matching) == 0, f"Original date still has event after reschedule: {matching}"
        print(f"PASS: No event on original date {orig_date} after reschedule")

    def test_delete_reschedule_restores_original(self, auth_headers):
        if not hasattr(TestReschedule, "_original_date"):
            pytest.skip("Depends on test_reschedule_session")

        orig_date = TestReschedule._original_date

        r = requests.delete(
            f"{BASE_URL}/api/calendar/reschedule/{orig_date}",
            headers=auth_headers,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

        # Verify event is back on original date
        start = (datetime.strptime(orig_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (datetime.strptime(orig_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")

        r2 = requests.get(
            f"{BASE_URL}/api/calendar/events",
            params={"start_date": start, "end_date": end},
            headers=auth_headers,
        )
        assert r2.status_code == 200
        data = r2.json()
        events = data if isinstance(data, list) else data.get("events", [])
        matching = [e for e in events if e.get("date", "")[:10] == orig_date]
        assert len(matching) > 0, f"Event not restored to original date {orig_date}: {events}"
        print(f"PASS: Event restored to {orig_date} after DELETE reschedule")


class TestIntakeWithPreferredDays:
    """POST /api/profile/intake with preferredDays"""

    def test_intake_saves_preferred_days(self, fresh_headers):
        payload = {
            "userId": "fresh_user_c",
            "goal": "hypertrophy",
            "trainingStyle": "hypertrophy",
            "experienceLevel": "beginner",
            "frequency": 3,
            "preferredDays": ["monday", "thursday", "saturday"],
            "equipment": ["barbell", "dumbbell"],
            "injuries": [],
            "gender": "male",
            "units": "metric",
        }
        r = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=fresh_headers)
        assert r.status_code in (200, 201), f"Expected 200/201, got {r.status_code}: {r.text}"
        data = r.json()
        # Check preferredDays saved
        profile = data.get("profile", data)
        saved_days = profile.get("preferredDays", profile.get("preferred_days", []))
        assert set(saved_days) == {"monday", "thursday", "saturday"}, \
            f"preferredDays not saved correctly: {saved_days} in {data}"
        print(f"PASS: intake saved preferredDays: {saved_days}")

    def test_calendar_events_on_3_preferred_days(self, fresh_headers):
        """After intake with mon/thu/sat, events should be on those days"""
        r = requests.get(
            f"{BASE_URL}/api/calendar/events",
            params={"start_date": "2026-01-01", "end_date": "2026-06-30"},
            headers=fresh_headers,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        events = data if isinstance(data, list) else data.get("events", [])

        if len(events) == 0:
            pytest.skip("No calendar events generated after intake")

        allowed = {"Monday", "Thursday", "Saturday"}
        day_name_map = {0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday",
                        4: "Friday", 5: "Saturday", 6: "Sunday"}

        bad = []
        for ev in events[:30]:
            date_str = ev.get("date", "")
            if not date_str:
                continue
            try:
                d = datetime.strptime(date_str[:10], "%Y-%m-%d")
                dn = day_name_map[d.weekday()]
                if dn not in allowed:
                    bad.append(f"{date_str} ({dn})")
            except Exception:
                pass

        assert len(bad) == 0, f"Events on wrong days (expected Mon/Thu/Sat): {bad[:5]}"
        print(f"PASS: Events for fresh user fall on Mon/Thu/Sat")
