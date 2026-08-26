import { api } from "./client";
import {
  AlertItem,
  AuthResponse,
  Card,
  Device,
  EmergencyContact,
  FamilyActive,
  FamilyResponse,
  Incident,
  LiveShare,
  SafeZone,
  SosEvent,
  Tag,
  User,
  Vehicle,
} from "./types";

// ---------- Auth ----------
export const login = (email: string, password: string) =>
  api.post<AuthResponse>("/auth/login", { email, password }).then((r) => r.data);

export const register = (name: string, email: string, phone: string, password: string) =>
  api.post<AuthResponse>("/auth/register", { name, email, phone, password }).then((r) => r.data);

export const otpRequest = (phone: string) =>
  api.post<{ ok: boolean; channel: string; dev_code: string | null; live: boolean }>(
    "/auth/otp/request",
    { phone },
  ).then((r) => r.data);

export const otpVerify = (phone: string, code: string, name?: string) =>
  api.post<AuthResponse>("/auth/otp/verify", { phone, code, name }).then((r) => r.data);

export const getMe = () => api.get<User>("/auth/me").then((r) => r.data);

// ---------- Push (Guardian Alert) ----------
export const registerPush = (user_id: string, platform: string, device_token: string) =>
  api.post("/register-push", { user_id, platform, device_token }).then((r) => r.data);

export const updateMe = (payload: Partial<Pick<User, "name" | "phone">> & { notify_prefs?: Partial<User["notify_prefs"]>; escalate_seconds?: number }) =>
  api.put<User>("/auth/me", payload).then((r) => r.data);

// ---------- Personal Safety ----------
export const triggerSos = (latitude: number, longitude: number, message?: string) =>
  api.post<SosEvent>("/me/sos", { latitude, longitude, message }).then((r) => r.data);

export const listSosEvents = () => api.get<SosEvent[]>("/me/sos-events").then((r) => r.data);
export const ackSos = (id: string) => api.post(`/me/sos/${id}/ack`, {}).then((r) => r.data);

export const listContacts = () =>
  api.get<EmergencyContact[]>("/me/emergency-contacts").then((r) => r.data);

export const addContact = (name: string, phone: string, relation?: string) =>
  api.post<EmergencyContact>("/me/emergency-contacts", { name, phone, relation }).then((r) => r.data);

export const deleteContact = (id: string) =>
  api.delete(`/me/emergency-contacts/${id}`).then((r) => r.data);

export const startLiveShare = (duration_minutes: number) =>
  api.post<LiveShare>("/me/live-share", { duration_minutes }).then((r) => r.data);

export const pingLocation = (latitude: number, longitude: number, battery?: number) =>
  api.post("/me/location", { latitude, longitude, battery }).then((r) => r.data);

// ---------- Safe Zones ----------
export const listSafeZones = () => api.get<SafeZone[]>("/me/safe-zones").then((r) => r.data);

export const addSafeZone = (name: string, latitude: number, longitude: number, radius_m: number) =>
  api.post<SafeZone>("/me/safe-zones", { name, latitude, longitude, radius_m }).then((r) => r.data);

export const deleteSafeZone = (id: string) =>
  api.delete(`/me/safe-zones/${id}`).then((r) => r.data);

// ---------- Family ----------
export const getFamily = () => api.get<FamilyResponse>("/family").then((r) => r.data);

export const createFamily = (name: string) =>
  api.post<FamilyActive>("/family", { name }).then((r) => r.data);

export const joinFamily = (invite_code: string) =>
  api.post("/family/join", { invite_code }).then((r) => r.data);

export interface FamilySos {
  id: string;
  owner_name: string;
  is_me: boolean;
  latitude: number;
  longitude: number;
  created_at: string;
  escalation_level?: number;
}
export const familySos = () => api.get<FamilySos[]>("/family/sos").then((r) => r.data);
export const familyAckSos = (id: string) => api.post(`/family/sos/${id}/ack`, {}).then((r) => r.data);

// ---------- Smart QR ----------
export const listVehicles = () => api.get<Vehicle[]>("/vehicles").then((r) => r.data);
export const addVehicle = (number_plate: string, vehicle_type: string, make_model?: string) =>
  api.post<Vehicle>("/vehicles", { number_plate, vehicle_type, make_model }).then((r) => r.data);

export const listTags = () => api.get<Tag[]>("/tags").then((r) => r.data);
export const addTag = (name: string, tag_type: string) =>
  api.post<Tag>("/tags", { name, tag_type }).then((r) => r.data);
export const updateTag = (
  id: string,
  payload: { name: string; tag_type: string; reward_text?: string | null; description?: string | null },
) => api.put<Tag>(`/tags/${id}`, payload).then((r) => r.data);
export const setTagLost = (id: string, enabled: boolean) =>
  api.post<Tag>(`/tags/${id}/lost_mode`, { enabled }).then((r) => r.data);
export const setVehicleLost = (id: string, enabled: boolean) =>
  api.post<Vehicle>(`/vehicles/${id}/lost_mode`, { enabled }).then((r) => r.data);

export const listCards = () => api.get<Card[]>("/cards").then((r) => r.data);
export const addCard = (display_name: string, title?: string, phone?: string) =>
  api.post<Card>("/cards", { display_name, title, phone }).then((r) => r.data);

// ---------- Alerts & Incidents ----------
export const listAlerts = () => api.get<AlertItem[]>("/alerts").then((r) => r.data);
export const listIncidents = () =>
  api.get<{ count: number; results: Incident[] }>("/incidents").then((r) => r.data);

// ---------- Anti-theft devices ----------
export const listDevices = () => api.get<Device[]>("/devices").then((r) => r.data);
export const addDevice = (name: string, platform: string, model?: string) =>
  api.post<Device>("/devices", { name, platform, model }).then((r) => r.data);
export const lockState = (id: string) =>
  api.get<{ locked: boolean; lock_threshold: number }>(`/devices/${id}/lock-state`).then((r) => r.data);
export const sirenState = (id: string) =>
  api.get<{ siren_active: boolean }>(`/devices/${id}/siren-state`).then((r) => r.data);
export const reportIntruder = (id: string) =>
  api.post(`/devices/${id}/intruder`, {}).then((r) => r.data);
export const reportSimSwap = (id: string) =>
  api.post(`/devices/${id}/sim-swap`, {}).then((r) => r.data);

// scan URL that a QR should encode
export const scanUrl = (qrId: string) => `${process.env.EXPO_PUBLIC_API_URL}/scan/${qrId}`;

// ---------- Public scan / report (finder flow, no ownership required) ----------
export interface ResolvedItem {
  kind?: string;
  number_plate?: string;
  vehicle_type?: string;
  name?: string;
  tag_type?: string;
  display_name?: string;
  title?: string;
  phone?: string | null;
  reward_text?: string | null;
  lost_mode?: boolean;
  [k: string]: unknown;
}
export interface ScanReportPayload {
  type?: string;
  scanner_note?: string | null;
  scanner_phone?: string | null;
  scanner_lat?: number | null;
  scanner_lng?: number | null;
}

export const resolveQr = (qrId: string) =>
  api.get<ResolvedItem>(`/public/qr/${qrId}`).then((r) => r.data);
export const resolveCard = (qrId: string) =>
  api.get<ResolvedItem>(`/public/card/${qrId}`).then((r) => r.data);
export const reportIncident = (qrId: string, payload: ScanReportPayload) =>
  api.post(`/public/qr/${qrId}/incident`, payload).then((r) => r.data);
export const alertTag = (qrId: string, payload: ScanReportPayload) =>
  api.post(`/public/tag/${qrId}/alert`, payload).then((r) => r.data);
export const messageCard = (qrId: string, payload: { name?: string; phone?: string; message?: string }) =>
  api.post(`/public/card/${qrId}/message`, payload).then((r) => r.data);

// pull a bare qr id out of a scanned value (URL or raw id)
export const parseQrValue = (value: string): string => {
  const trimmed = value.trim();
  const marker = "/scan/";
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) return trimmed.slice(idx + marker.length).split(/[/?#]/)[0];
  return trimmed.split(/[/?#]/).pop() || trimmed;
};
