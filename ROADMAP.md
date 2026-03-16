# Turo Fleet App — Roadmap

Built to match and exceed [Qarhami](https://qarhami.com) functionality, tailored for Eduardo's 31-car Turo fleet.

---

## Phase 0 — Deploy What You Have
**Goal:** Get current lock/unlock + fleet map live for daily use.
**Timeline:** This week

- [ ] Add auth (NextAuth or simple password gate)
- [ ] Environment variables for production (WhatsGPS token, etc.)
- [ ] Deploy to Vercel (free tier)
- [ ] Mobile-friendly polish (primary use case is phone)

---

## Phase 1 — Core Controls
**Goal:** Match Qarhami's "Control" feature set.
**Timeline:** Weeks 1–2

- [ ] Linked lock + kill switch — single "Secure" / "Release" button
- [ ] Horn honk (if WhatsGPS supports it)
- [ ] Vehicle labeling/nicknames (e.g. "White Civic #7")
- [ ] Search & filter by name, status, or location
- [ ] Bulk actions — "Lock All Idle", multi-select
- [ ] Pull-to-refresh / auto-refresh fleet status

---

## Phase 2 — Tracking & History
**Goal:** Match Qarhami's "Track" feature set.
**Timeline:** Weeks 3–4

- [ ] Live location — auto-refresh map positions (30–60s polling)
- [ ] Location history / trip timelines with date picker
- [ ] Driver behavior events (speeding, harsh braking)
- [ ] Geofences — draw zones on map, alert on exit
- [ ] Mileage tracking per trip
- [ ] 3-month location history retention

---

## Phase 3 — Turo Integration
**Goal:** Deep integration with Turo rental data. Key differentiator.
**Timeline:** Weeks 5–6

- [ ] Auto-import Turo trips (CSV upload → match reservations to vehicles)
- [ ] Turo API integration (or scraping) for real-time trip data
- [ ] Auto lock/unlock scheduling — lock at trip end, unlock at trip start
- [ ] Late return alerts
- [ ] Renter shared access link — read-only page to locate/unlock car (no app install)
- [ ] Low fuel return detection (if OBD data available)
- [ ] Total miles driven vs Turo allowance tracking

---

## Phase 4 — Alerts & Security
**Goal:** Match Qarhami's "Secure" feature set.
**Timeline:** Weeks 7–8

- [ ] Push notifications (web push + Telegram/WhatsApp via OpenClaw)
- [ ] Tow alerts — car moving while kill switch is on
- [ ] Low battery alerts from telematics device
- [ ] Speeding alerts — configurable thresholds per car
- [ ] Tamper detection (device disconnected)
- [ ] Toll reports — flag trips through toll zones via GPS history
- [ ] Configurable alert channels (SMS, push, email)

---

## Phase 5 — Analytics Dashboard
**Goal:** Business intelligence for the fleet.
**Timeline:** Weeks 9–10

- [ ] Revenue per car (from Turo data)
- [ ] Utilization rate (days rented vs idle)
- [ ] Cost tracking (maintenance, insurance, tickets)
- [ ] Top/bottom performing vehicles
- [ ] Monthly P&L view
- [ ] Mileage per trip vs Turo allowance
- [ ] Exportable reports (CSV/PDF)

---

## Phase 6 — Polish & Scale
**Goal:** Production-grade platform.
**Timeline:** Ongoing

- [ ] PWA or React Native mobile app
- [ ] Multi-user access (for staff)
- [ ] Role-based permissions (manager / driver / viewer)
- [ ] Custom domain + branding
- [ ] Stripe billing (if offering to other hosts)
- [ ] API documentation

---

## Infrastructure Notes

| Layer | Choice | Why |
|-------|--------|-----|
| Hosting | Vercel (free tier) | Zero-config Next.js deploys |
| Database | None initially → Supabase/Postgres at Phase 3 | Trip history, geofences, analytics need persistence |
| Auth | NextAuth or simple password | Single-user for now, expand later |
| Notifications | OpenClaw (Telegram/WhatsApp) + Web Push | Already wired up |
| Telematics | WhatsGPS G21L API | Already integrated |

---

## What's Built Today

- ✅ WhatsGPS API integration (lock/unlock/kill switch)
- ✅ Fleet map with live car positions (Leaflet)
- ✅ Turo CSV parser (rentals matched to vehicles)
- ✅ API routes: `/api/fleet`, `/api/command`, `/api/rentals`, `/api/analytics`
- ✅ "Lock All Idle" concept (lock+kill cars not on active rentals)
