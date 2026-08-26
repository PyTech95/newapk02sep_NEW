// API response types for the NekSathi backend.

export interface NotifyPrefs {
  whatsapp: boolean;
  email: boolean;
  push: boolean;
  incident_alerts: boolean;
  speed_alerts: boolean;
  marketing: boolean;
  ringtone: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  is_admin: boolean;
  is_dealer: boolean;
  is_org: boolean;
  suspended: boolean;
  notify_prefs: NotifyPrefs;
  escalate_seconds?: number;
  avatar_base64: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface SosEvent {
  id: string;
  latitude: number;
  longitude: number;
  message: string | null;
  notified: number;
  channels: string[];
  has_photo: boolean;
  acknowledged: boolean;
  escalated: boolean;
  escalation_level?: number;
  created_at: string;
}

export interface LiveShare {
  id: string;
  token: string;
  label: string | null;
  active: boolean;
  expires_at: string;
  created_at: string;
}

export interface SafeZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  notify: boolean;
  last_inside: boolean | null;
  created_at: string;
}

export interface FamilyMember {
  member_id: string;
  user_id: string;
  name: string;
  role: string;
  is_me: boolean;
  share_location: boolean;
  share_activity: boolean;
  latitude: number | null;
  longitude: number | null;
  battery: number | null;
  last_seen: string | null;
  trail?: { latitude: number; longitude: number }[];
}

export interface FamilyNone {
  in_family: false;
}
export interface FamilyActive {
  in_family: true;
  id: string;
  name: string;
  is_guardian: boolean;
  invite_code: string;
  max_members: number;
  members: FamilyMember[];
}
export type FamilyResponse = FamilyNone | FamilyActive;

export interface Vehicle {
  id: string;
  number_plate: string;
  vehicle_type: string;
  make_model: string | null;
  color: string | null;
  qr_id: string;
  speed_limit_kmh: number;
  lost_mode: boolean;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  tag_type: string;
  description: string | null;
  blood_group: string | null;
  reward_text: string | null;
  qr_id: string;
  lost_mode: boolean;
  created_at: string;
}

export interface Card {
  id: string;
  display_name: string;
  title: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  qr_id: string;
  created_at: string;
}

export interface Device {
  id: string;
  name: string;
  platform: string;
  lock_threshold: number;
  guardian_contact_id: string | null;
  super_admin_alerts: boolean;
  locked: boolean;
  siren_active: boolean;
  created_at: string;
  last_seen: string;
}

export interface AlertItem {
  id: string;
  type?: string;
  title?: string;
  message?: string;
  created_at?: string;
  [k: string]: unknown;
}

export interface Incident {
  id: string;
  kind?: string;
  status?: string;
  created_at?: string;
  [k: string]: unknown;
}
