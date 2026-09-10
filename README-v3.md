# AutoRevenue AI v0.3 — Dealer Revenue OS

A dependency-free Node 18+ MVP that can run immediately without npm packages.

## What is implemented
- Multi-dealer data model and tenant isolation
- Login/session auth
- Inventory CRUD basics
- Lead creation/update + automatic HOT/WARM/COLD scoring
- AI sales conversation endpoint
- OpenAI integration when `OPENAI_API_KEY` is set; safe local fallback otherwise
- WhatsApp Cloud API webhook + outbound messaging adapter
- Test-drive appointment booking
- Revenue Leak Detector + Fix Everything action
- Conversation history
- Dealer settings
- Billing endpoint placeholder for Stripe
- Responsive dashboard

## Run
```bash
node server.mjs
```
Open `http://localhost:3001`.
Demo login: `admin@atlas-cars.ma` / `admin123`.

## Real integrations
Copy `.env.example` to `.env` and provide credentials. Node does not automatically load `.env`, so export them in your shell or use your process manager's environment configuration.

### WhatsApp
Set `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Configure the Meta webhook URL as `/api/whatsapp/webhook` and subscribe to messages.

### OpenAI
Set `OPENAI_API_KEY`. The `/api/ai/reply` endpoint will then use the model specified by `OPENAI_MODEL`.

### Production hardening before paid launch
- PostgreSQL/Prisma instead of JSON persistence
- Argon2/bcrypt password hashing
- CSRF/rate limiting/audit logs
- Proper JWT or secure HTTP-only sessions
- Meta app verification and webhook signature validation
- Google Calendar OAuth
- Stripe Checkout + webhooks
- CNDP/Law 09-08 compliance, retention/deletion controls and transfer review
- Background job queue for follow-ups
- Object storage for documents/images
