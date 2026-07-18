# Test Credentials

## Auth Users (db.users — email/password auth)
| User | Email | Password | Notes |
|------|-------|----------|-------|
| User A (test) | user_a@theprogram.app | StrongmanA123 | Strongman advanced, SI Joint injury |
| User B (test) | user_b@theprogram.app | HypertrophyB123 | Hypertrophy intermediate |
| Strongman test | test_strongman@test.com | TestPass123 | Shoulder injury, has log/axle/yoke |
| Hypertrophy test | test_hypertrophy@test.com | TestPass123 | Beginner, knee injury, commercial gym |
| Fresh user C | fresh_user_c@test.com | TestC123 | Fresh user for isolation testing |

## Default Backwards-Compatible User
- userId: user_001 (DEFAULT_USER)
- No auth required — used as fallback when no JWT token provided (Option A)
- Has completed onboarding (seeded from previous sessions)

## Admin Endpoint
- URL: GET /api/admin/users
- Header: Authorization: Bearer admin_secret_change_in_production

## JWT Details
- Algorithm: HS256
- Expiry: 30 days
- Secret: from .env JWT_SECRET (auto-generated 256-bit hex)

## Social Login (Coming Soon)
- Google, Apple (iOS only), Facebook — placeholder client IDs
- Email/password is the working auth flow for now

## Analytics Test Users (seeded by /app/backend/seed_analytics_test_users.py — password: Analytics123)
| User | Email | Scenario |
|------|-------|----------|
| Creep Carl | analytics_creep@test.com | 4 wks bench @185, RPE 7→7.5→8.5→9 (RPE creep flag) |
| Effective Eddie | analytics_e1rm@test.com | entered bench 300, logs imply e1RM 324 (+8%) |
| Painful Pat | analytics_injury@test.com | active shoulder injury, rising pain clustered after Overhead Press |
| Thin Data Tina | analytics_thin@test.com | only ~1 week of logs (low-confidence path) |
| Empty Evan | analytics_empty@test.com | zero logs / zero analytics |
