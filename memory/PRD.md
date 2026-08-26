# NekSathi — Mobile Companion App (PRD)

## Original problem statement
Build a native mobile app "NekSathi" (Expo + expo-router, TypeScript) that talks to the EXISTING backend at `https://neksathi-deploy.preview.emergentagent.com` (all endpoints prefixed `/api`). JWT bearer auth stored in secure storage, attached via an axios interceptor; 401 clears token and returns to Login. Deliverable is a sideloadable app across Phases 1–5 + 7.

## Architecture
- Frontend-only companion app; consumes the external NekSathi API.
- Base URL in `EXPO_PUBLIC_API_URL` (`/app/frontend/.env`).
- `src/api/client.ts` — axios instance + request/response interceptors (token attach, 401 logout).
- `src/api/endpoints.ts` + `src/api/types.ts` — typed API layer.
- `src/context/AuthContext.tsx` — session bootstrap (`GET /auth/me`), route guard, login/register/otp/logout.
- `src/context/ToastContext.tsx` — global toast.
- Theme in `src/theme` (dark neon glassmorphic; Chakra Petch display + Outfit body).
- Reusable UI: GlassCard, NeonButton, Chip, Field, EmptyState, ScreenHeader, SOSButton, TabBar, OverlayForm, AuthShell, FamilyMap (native) + FamilyMap.web (fallback).

## User personas
- Individual wanting one-tap SOS + live location.
- Family guardian tracking a circle of up to 5 members.
- Owner protecting phone/vehicle/bag/pet via anti-theft + Smart QR.

## Core requirements (static)
- Auth: email login, register, phone OTP (WhatsApp code).
- Personal safety: SOS with GPS, SOS history, emergency contacts CRUD, live share, safe zones.
- Family: create/join, live map + members (battery/last-seen), auto-refresh 30s.
- Smart QR: Vehicles / Tags / ICE Cards, each with scannable QR.
- Alerts & incidents; profile edit + notification prefs; logout.
- Anti-theft: register device, lock/siren state, intruder & SIM-swap reports.

## Implemented (2026-06 / initial build)
- [x] Auth (login + demo autofill, register, phone OTP) with secure-store JWT + route guard.
- [x] Bottom tabs: Home / Family / Safety / Security / Profile (custom glass tab bar).
- [x] Home: pulsing SOS button (GPS → POST /me/sos), live share, stat cards, quick actions.
- [x] Safety hub: contacts CRUD, safe zones (GPS-centered) CRUD, SOS history, alerts.
- [x] Family: create/join via invite code, native map with member/zone pins, bottom-sheet member list, invite-code copy, 30s auto-refresh.
- [x] Security: Anti-theft device register + intruder/SIM-swap reports + lock/siren badges; Smart QR for Vehicles/Tags/Cards with QR-detail modal.
- [x] Profile: edit name/phone, notification-preference switches, logout.
- [x] Full permission handling for location (contextual request + Open Settings on block).
- Verified: 13/13 backend integration tests + all critical frontend flows (testing agent, iteration_1).

## Known native-only limitations (need a real build, not Expo Go)
- Real GPS + background 60s location foreground-service ping.
- Anti-theft remote lock/siren/intruder-selfie (Device Admin).
- Family live map (react-native-maps) — web shows a fallback panel.

## Implemented (2026-06 / feature update)
- [x] **Panic Countdown**: SOS now shows a cancelable 3-2-1 countdown (haptic ticks) before firing — prevents accidental alerts. (`src/components/SosCountdown.tsx`, Home)
- [x] **Lost Mode Toggle**: Vehicles & Tags can be flipped to Lost Mode (`POST /{tags|vehicles}/{id}/lost_mode`); tags support a reward note (`PUT /tags/{id}`) shown to whoever scans. Red LOST badge + reward on the row. (Security → Smart QR)
- [x] **Background Guardian**: Safety toggle starts a 60s foreground-service location ping (`POST /me/location` with battery) via expo-task-manager + expo-location background updates — keeps family's live trail even when app is closed. Native-build only (not Expo Go/web). (`src/services/backgroundLocation.ts`, Safety)

## Implemented (2026-06 / feature update 2)
- [x] **In-App QR Scanner**: `expo-camera` scanner (`app/scan.tsx`) with full permission handling → resolves the QR (`GET /public/qr/{id}`, fallback `GET /public/card/{id}`) and opens a finder report screen (`app/scan-report.tsx`). Vehicles → incident report (`POST /public/qr/{id}/incident` wrong_parking/accident/theft/other), Tags → found/theft alert (`POST /public/tag/{id}/alert`), Cards → private message (`POST /public/card/{id}/message`). Attaches finder geo; owner's number stays private. Entry points: Home header + Safety tool.
- [x] **Guardian Schedule**: `app/guardian-schedule.tsx` + `src/services/guardianSchedule.ts` — daily on/off window (time pickers + day chips), persisted; reconciled on app-active/Safety focus so Guardian auto-starts/stops within the window.
- [x] **Reward Payout (promise)**: Lost Mode form now captures a reward amount + UPI ID + note, composed into the tag's `reward_text`, shown to whoever scans. (Actual escrow/auto-release requires a payment gateway on the backend — see backlog.)

## Implemented (2026-06 / feature update 3)
- [x] **Scan History**: `app/scan-history.tsx` merges `GET /api/incidents` + `GET /api/alerts` into a chronological "who scanned my QR" timeline with type, note, relative time and location. Entry points: Safety tool + Security header clock icon. Defensive field mapping.
- [x] **Guardian Auto-Arm**: `src/services/guardianControl.ts` — auto-arm toggle on the Guardian schedule screen; on app-active/Safety focus it checks GPS vs safe zones (haversine) and starts Guardian when you're outside every safe zone, stops when back inside. Combined cleanly with the daily Schedule.

## Not built (hard limits — explained to user)
- **Native Anti-Theft Build (Device Admin)**: needs a bare/native Android module compiled into a real build — cannot be authored/compiled/tested in this managed preview. App-side controls (register device, report intruder/sim-swap, lock/siren polling) are already wired; OS enforcement is a dedicated native build.
- **Real Reward Escrow (Razorpay)**: escrow + payout must live server-side on a backend I control. This app is a frontend for the user's EXTERNAL backend, so I can't add order/payout endpoints; also needs a Razorpay merchant account, KYC and keys. The reward *promise* (amount + UPI shown to finder) is implemented.

## Implemented (2026-06 / feature update 4)
- [x] **Scan Map View**: Scan History has a List/Map toggle (header icon); map plots each located scan (`src/components/ScanMap.tsx` + `.web.tsx` fallback), incident pins red, alert pins teal.
- [x] **Reward on Return**: Lost tags show a "Recovered — pay the finder" action → enter finder's UPI + amount → opens the owner's UPI app via a `upi://pay` deep link to send the reward, then turns off lost mode. No gateway/backend needed (uses the device's UPI app).

## Platform guidance (from support)
- Emergent Mobile supports managed Expo + FastAPI + Mongo only — no bare/native workflow or custom native modules. Native Device-Admin anti-theft is out of scope here.
- Server-side features (e.g. Razorpay escrow/payout) require the backend to be built inside an Emergent workspace; the agent can't modify the user's separate external backend.

## Implemented (2026-06 / feature update 5)
- [x] **Scan Alert Badge**: `src/services/scanBadge.ts` + TabBar — polls incidents+alerts count every 30s and shows a red dot on the Security tab when new scans arrive since last viewed; cleared when the Security tab is opened.
- [x] **Recovery Receipt**: `src/services/receipts.ts` + `app/receipts.tsx` — every reward paid on recovery is logged on-device (item, finder UPI, amount, date, paid/logged status). Entry: Safety → Recovery receipts.

## MAJOR: Backend migrated in-workspace (2026-06 / update 6)
- [x] **Rebuilt the NekSathi API inside this workspace** — `/app/backend/server.py` (FastAPI + MongoDB + JWT/bcrypt), all /api endpoints the app uses: auth (login/register/OTP-with-dev-code/me/update), personal safety (SOS+history, contacts, live-share, location, safe-zones), family (create/join/members), Smart QR (vehicles/tags/cards CRUD + PUT + lost_mode + public resolvers), public scan/report (incident/tag-alert/card-message → owner alerts/incidents), devices (lock/siren/intruder/sim-swap). Demo user seeded on startup (demo@neksathi.app / demo1234). App now points `EXPO_PUBLIC_API_URL` at this workspace — no external dependency.
- [x] Verified: **21/21 backend tests + all frontend flows pass** (testing agent iteration_2), full FE↔BE data flow confirmed.
- [x] **Badge Everywhere**: new-scan red dot now also on the Home bell (mirrors Security tab).
- [x] **Export Receipts**: share button on Recovery receipts exports the list + total via the OS share sheet.
- Note: OTP returns `dev_code` in the response (no WhatsApp provider wired) — remove before production.

## Backlog
- P1: Native Device-Admin anti-theft module (remote lock/siren/intruder-selfie + shutdown-resistant tracking).
- P1: Real reward payout — integrate a payment gateway (e.g. Razorpay) with escrow + release-on-return (needs backend support).
- Note: external backend at neksathi-deploy was returning 404 during this build session; live scan/report verification is pending its recovery (all calls match the confirmed contract).
- P2: Richer QR item editing (photos, lost-mode toggle, ICE medical fields).
- P2: Map clustering + tap-to-focus a member; safe-zone drawing on map.
- P2: In-app scan flow (camera) to report a found item.
