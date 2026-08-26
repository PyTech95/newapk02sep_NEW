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

## Backlog
- P1: Anti-theft native Device-Admin module (lock/siren/intruder capture).
- P2: Richer QR item editing (photos, lost-mode toggle, ICE medical fields).
- P2: Map clustering + tap-to-focus a member; safe-zone drawing on map.
- P2: In-app scan flow (camera) to report a found item.
