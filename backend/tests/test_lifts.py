"""
Backend tests for Lifts feature: catalog, CRUD, featured lifts
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

TEST_EMAIL = "user_a@theprogram.app"
TEST_PASS = "StrongmanA123"

@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASS})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

# ─── Catalog ────────────────────────────────────────────────────────────────
def test_get_catalog(auth_headers):
    r = requests.get(f"{BASE_URL}/api/lifts/catalog", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "categories" in data
    cats = data["categories"]
    assert len(cats) == 6, f"Expected 6 categories, got {len(cats)}"
    names = [c["name"] for c in cats]
    assert "Powerlifting" in names
    assert "Strongman" in names
    assert "Olympic" in names
    print(f"Catalog: {names}")

# ─── GET lifts ────────────────────────────────────────────────────────────
def test_get_lifts(auth_headers):
    r = requests.get(f"{BASE_URL}/api/lifts", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "lifts" in data
    print(f"Tracked lifts count: {len(data['lifts'])}")

# ─── Add a new lift ───────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def created_lift_id(auth_headers):
    # Try to delete TEST_Yoke first (cleanup from previous run)
    r = requests.get(f"{BASE_URL}/api/lifts", headers=auth_headers)
    lifts = r.json().get("lifts", [])
    for lift in lifts:
        if lift["exercise"] == "TEST_Yoke":
            requests.delete(f"{BASE_URL}/api/lifts/{lift['id']}", headers=auth_headers)
    
    # Add new lift
    r = requests.post(f"{BASE_URL}/api/lifts", headers=auth_headers, json={
        "exercise": "TEST_Yoke",
        "category": "Strongman",
        "bestWeight": 400,
        "bestReps": 1
    })
    assert r.status_code == 200, f"Failed to add lift: {r.text}"
    data = r.json()
    assert data["exercise"] == "TEST_Yoke"
    assert data["category"] == "Strongman"
    print(f"Created lift id: {data['id']}")
    return data["id"]

def test_add_lift_and_verify(auth_headers, created_lift_id):
    r = requests.get(f"{BASE_URL}/api/lifts", headers=auth_headers)
    assert r.status_code == 200
    lifts = r.json()["lifts"]
    ids = [l["id"] for l in lifts]
    assert created_lift_id in ids, "Newly added lift not in list"
    print(f"PASS: Lift {created_lift_id} visible in list")

def test_add_duplicate_lift(auth_headers, created_lift_id):
    """Adding same lift twice should return 400"""
    r = requests.post(f"{BASE_URL}/api/lifts", headers=auth_headers, json={
        "exercise": "TEST_Yoke", "category": "Strongman"
    })
    assert r.status_code == 400
    print("PASS: duplicate returns 400")

# ─── Update lift ─────────────────────────────────────────────────────────
def test_update_lift_pr(auth_headers, created_lift_id):
    r = requests.put(f"{BASE_URL}/api/lifts/{created_lift_id}", headers=auth_headers, json={
        "bestWeight": 450, "bestReps": 1
    })
    assert r.status_code == 200
    data = r.json()
    assert data["bestWeight"] == 450
    # bestE1rm = epley(450, 1) = 450
    assert data["bestE1rm"] == 450
    print(f"PASS: Updated PR. bestE1rm={data['bestE1rm']}")

# ─── Featured lifts ──────────────────────────────────────────────────────
def test_set_featured_lifts(auth_headers, created_lift_id):
    r = requests.put(f"{BASE_URL}/api/lifts/featured", headers=auth_headers, json={
        "featuredIds": [created_lift_id]
    })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] == True
    assert data["featuredCount"] == 1
    print("PASS: set featured")

def test_featured_max_3_limit(auth_headers):
    """Trying to feature 4 should return 400"""
    fake_ids = ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb", 
                "cccccccccccccccccccccccc", "dddddddddddddddddddddddd"]
    r = requests.put(f"{BASE_URL}/api/lifts/featured", headers=auth_headers, json={
        "featuredIds": fake_ids
    })
    assert r.status_code == 400
    print("PASS: max 3 featured enforced")

# ─── Delete lift ─────────────────────────────────────────────────────────
def test_delete_lift(auth_headers, created_lift_id):
    r = requests.delete(f"{BASE_URL}/api/lifts/{created_lift_id}", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] == True
    # verify it's gone
    r2 = requests.get(f"{BASE_URL}/api/lifts", headers=auth_headers)
    lifts = r2.json()["lifts"]
    ids = [l["id"] for l in lifts]
    assert created_lift_id not in ids
    print("PASS: Lift deleted and not in list")

def test_delete_nonexistent_lift(auth_headers):
    fake_id = "aaaaaaaaaaaaaaaaaaaaaaaa"
    r = requests.delete(f"{BASE_URL}/api/lifts/{fake_id}", headers=auth_headers)
    assert r.status_code == 404
    print("PASS: 404 on missing lift")
