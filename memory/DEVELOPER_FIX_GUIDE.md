# NekSathi — Developer Fix Guide (3 issues)

All findings below were verified against the **LIVE** backend `https://api.neksathi.in`.
Fix in this order: **Fix 1 (crash)** → **Fix 2 (notifications)** → **Fix 3 (voice call)**.

---

## FIX 1 — App crashes when opening an Alert (and Family Map)

### Root cause
The Alert Detail screen and the Family tab render a Google map using `react-native-maps`.
A **release APK crashes** the instant it tries to draw a Google map when there is **no
Google Maps Android API key** in the manifest. `app.json` currently has **no key**, so any
screen with a map kills the app.

- Crashing screens: `app/alert-detail.tsx` (renders `ScanMap`), `app/(tabs)/family.tsx` (renders `FamilyMap`).

### Steps
1. **Get a Google Maps Android API key**
   - Go to https://console.cloud.google.com/ → create/select a project.
   - APIs & Services → Library → enable **"Maps SDK for Android"**.
   - APIs & Services → Credentials → **Create credentials → API key**.
   - (Recommended) Restrict the key: Application restriction = Android apps,
     add package name `com.emergent.mobilesafetyapp.r8ptmu` + your app's SHA-1.

2. **Add the key to `frontend/app.json`** inside the existing `"android"` block:
   ```json
   "android": {
     "package": "com.emergent.mobilesafetyapp.r8ptmu",
     "config": {
       "googleMaps": {
         "apiKey": "YOUR_ANDROID_MAPS_API_KEY"
       }
     },
     "permissions": [ ... keep existing ... ]
   }
   ```
   (For iOS later, add `"ios": { "config": { "googleMapsApiKey": "..." } }`.)

3. **Rebuild the APK.** Maps must be tested on the installed build (not Expo Go preview).

### Verify
- Open an alert that has a finder location → map renders, **no crash**.
- Open Family tab → map renders.

---

## FIX 2 — Push notifications not working

### Root cause
`src/services/push.ts` requests the **native FCM token** via
`Notifications.getDevicePushTokenAsync()`. On Android that only works when **Firebase**
is wired into the build through a `google-services.json` file. Without it the call throws,
is silently swallowed, no token is registered → no notifications ever arrive.

### Steps
1. **Create a Firebase project** at https://console.firebase.google.com/.
2. **Add an Android app** with package name **exactly** `com.emergent.mobilesafetyapp.r8ptmu`.
3. **Download `google-services.json`** and place it at `frontend/google-services.json`.
4. **Point `app.json` at it** (Android block):
   ```json
   "android": {
     "googleServicesFile": "./google-services.json",
     "package": "com.emergent.mobilesafetyapp.r8ptmu"
   }
   ```
5. Make sure the **FCM/Cloud Messaging** is enabled in Firebase (it is by default).
   Confirm the backend that sends pushes is using **this same Firebase project's**
   server credentials (FCM v1 / service account).
6. **Rebuild the APK.**

### Verify
- Log in on the installed build → `POST /api/register-push` should be called with a real
  `device_token` (check backend logs / DB).
- Trigger an event that sends a push from the backend → notification appears on the phone
  (foreground and background).

> Note: notifications **cannot** be tested in Expo Go / web preview — only on the installed build.

---

## FIX 3 — Voice call disconnects the moment the owner picks up

### Root cause
This is **not a network bug** — the in-app voice answering was never implemented.
In `src/components/LiveOverlays.tsx`, the **Accept** handler does this:

```ts
const onAccept = (c) => {
  dismiss(c);                              // <-- closes the call overlay immediately
  toast("Live in-app voice answering isn't enabled in this version yet ...");
};
```

So "pick up" = dismiss + show a placeholder message. There is **no WebRTC** code, no
microphone, no audio stream. That is why it "connects then disconnects".

### Good news — the backend ALREADY supports full WebRTC signaling
Verified live. The web portal (the finder/caller) already uses it. The mobile app just
needs to implement the **answerer** side.

#### Signaling contract (owner / mobile side — all require `Authorization: Bearer <token>`)
| Method & path | Body | Returns |
|---|---|---|
| `GET  /api/me/calls/incoming` | — | `{ items: [{ call_id, number_plate, created_at, has_offer }] }` |
| `GET  /api/me/calls/{call_id}` | — | `{ status, offer: {type:"offer", sdp}, caller_candidates: [{candidate, sdpMid, sdpMLineIndex}] }` |
| `POST /api/me/calls/{call_id}/accept` | `{ sdp: { type:"answer", sdp } }` | `{ ok: true }` |
| `POST /api/me/calls/{call_id}/candidate` | `{ candidate: { candidate, sdpMid, sdpMLineIndex } }` | `{ ok: true }` |
| `POST /api/me/calls/{call_id}/end` | — | `{ ok: true }` |
| `POST /api/me/calls/{call_id}/reject` | — | `{ ok: true }` |

#### Caller side (web portal — already done, for reference only)
`POST /api/public/qr/{qr_id}/call/start` → `{call_id}` ·
`POST /api/public/call/{call_id}/offer {sdp}` ·
`POST /api/public/call/{call_id}/candidate {candidate}` ·
`GET  /api/public/call/{call_id}` → `{ status, answer:{type,sdp}, callee_candidates:[...] }` ·
`POST /api/public/call/{call_id}/end`

> The signaling is **REST polling** (no WebSocket): each side posts its SDP + ICE candidates
> and polls the other side's endpoint for the peer's SDP + candidates.

### Implementation steps (mobile answerer)

1. **Install native deps** (needs a native build — you already build the APK yourself):
   ```bash
   cd frontend
   npx expo install react-native-webrtc @config-plugins/react-native-webrtc
   npx expo install react-native-incall-manager   # audio routing (earpiece/speaker)
   ```

2. **`app.json`** — add the plugin and the microphone permission:
   ```json
   "plugins": [
     ...,
     "@config-plugins/react-native-webrtc"
   ],
   "android": {
     "permissions": [ ...existing..., "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS" ]
   },
   "ios": {
     "infoPlist": {
       "NSMicrophoneUsageDescription": "Talk to the person who found your item"
     }
   }
   ```

3. **Add API helpers** in `src/api/endpoints.ts`:
   ```ts
   export const getCall = (id: string) =>
     api.get(`/me/calls/${id}`).then(r => r.data); // {status, offer, caller_candidates}
   export const acceptCall = (id: string, sdp: any) =>
     api.post(`/me/calls/${id}/accept`, { sdp }).then(r => r.data);
   export const sendCallCandidate = (id: string, candidate: any) =>
     api.post(`/me/calls/${id}/candidate`, { candidate }).then(r => r.data);
   // endCall already exists
   ```

4. **Answer flow (in `onAccept`)** — replace the placeholder with:
   ```ts
   import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices } from "react-native-webrtc";
   import InCallManager from "react-native-incall-manager";

   const ICE_SERVERS = {
     iceServers: [
       { urls: "stun:stun.l.google.com:19302" },
       // TODO: add your TURN server here (see "TURN" note below) — REQUIRED for cellular:
       // { urls: "turn:YOUR_TURN_HOST:3478", username: "user", credential: "pass" },
     ],
   };

   async function answer(callId: string) {
     const pc = new RTCPeerConnection(ICE_SERVERS);

     // 1. mic
     const stream = await mediaDevices.getUserMedia({ audio: true });
     stream.getTracks().forEach(t => pc.addTrack(t, stream));

     // 2. remote audio
     pc.ontrack = () => { InCallManager.start({ media: "audio" }); };

     // 3. send our ICE candidates up as they are gathered
     pc.onicecandidate = (e) => {
       if (e.candidate) sendCallCandidate(callId, e.candidate.toJSON());
     };

     // 4. get the caller's offer + candidates
     const call = await getCall(callId);
     await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
     for (const c of call.caller_candidates || [])
       await pc.addIceCandidate(new RTCIceCandidate(c));

     // 5. create + send answer
     const ans = await pc.createAnswer();
     await pc.setLocalDescription(ans);
     await acceptCall(callId, { type: ans.type, sdp: ans.sdp });

     // 6. keep polling for any NEW caller candidates (trickle ICE)
     const seen = new Set((call.caller_candidates || []).map(c => c.candidate));
     const poll = setInterval(async () => {
       const cur = await getCall(callId);
       for (const c of cur.caller_candidates || []) {
         if (!seen.has(c.candidate)) { seen.add(c.candidate); await pc.addIceCandidate(new RTCIceCandidate(c)); }
       }
       if (cur.status === "ended") { clearInterval(poll); hangup(); }
     }, 2000);

     return { pc, stream, poll };
   }

   function hangup(callId, pc, stream, poll) {
     clearInterval(poll);
     stream?.getTracks().forEach(t => t.stop());
     pc?.close();
     InCallManager.stop();
     endCall(callId);
   }
   ```

5. **UI**: while answering, keep the overlay open showing "Connecting… / Connected",
   a mute toggle, a speaker toggle (`InCallManager.setSpeakerphoneOn`), and a red
   "Hang up" button that calls `hangup()`.

6. **Rebuild the APK** and test with a real QR scan from the web portal.

### ⚠️ TURN server (important)
STUN alone only works when both devices are on friendly networks (e.g. same Wi‑Fi).
For real-world calls (finder on mobile data, owner on Wi‑Fi behind NAT) you **must** use a
**TURN** server to relay the audio. **Use the SAME TURN/STUN config your web portal already
uses** so both ends are symmetric. If the web portal uses a service (Twilio/Metered/coturn),
plug those `iceServers` credentials into `ICE_SERVERS` above.

### Verify
- Owner logged in on installed build.
- Finder scans the QR on the web portal and taps "Call owner".
- Owner's phone rings → taps **Accept** → **two-way audio**, stays connected.
- Either side taps hang up → call ends cleanly on both ends.

---

## Summary of what YOU (owner) must provide
1. **Google Maps Android API key** (Fix 1 — stops the crash).
2. **`google-services.json`** from Firebase (Fix 2 — enables notifications).
3. **TURN/STUN server credentials** already used by the web portal (Fix 3 — reliable voice).

Everything else (code, endpoints) is documented above and matches the live backend.
