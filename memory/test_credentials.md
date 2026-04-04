# Test Credentials

## Auth Users (db.users — email/password auth)
| User | Email | Password | Notes |
|------|-------|----------|-------|
| User A (test) | user_a@theprogram.app | StrongmanA123 | Registered, onboarding NOT complete |
| User B (test) | user_b@theprogram.app | HypertrophyB123 | Registered, onboarding NOT complete |

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
