import axios from "axios";

import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "neksathi_token";

const baseURL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

// Registered by AuthContext so the interceptor can force a logout on 401.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

api.interceptors.request.use(async (config) => {
  const token = await storage.secureGet(TOKEN_KEY, "");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error?.response?.status === 401) {
      await storage.secureRemove(TOKEN_KEY);
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

// Normalise an axios error into a short human message.
export const errMessage = (e: unknown, fallback = "Something went wrong"): string => {
  const anyE = e as any;
  const detail = anyE?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (anyE?.message) return anyE.message;
  return fallback;
};
