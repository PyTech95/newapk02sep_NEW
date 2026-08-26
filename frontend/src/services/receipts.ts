// Local log of rewards paid to finders when an item is recovered.
// Stored on-device (the external backend has no receipts endpoint).

import { storage } from "@/src/utils/storage";

export const RECEIPTS_KEY = "neksathi_recovery_receipts";

export interface Receipt {
  id: string;
  item: string;
  finderUpi: string;
  amount: string;
  paid: boolean;
  date: string; // ISO
}

export async function getReceipts(): Promise<Receipt[]> {
  const raw = await storage.getItem(RECEIPTS_KEY, "");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw as string);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function addReceipt(r: Omit<Receipt, "id" | "date">): Promise<void> {
  const list = await getReceipts();
  const entry: Receipt = { ...r, id: `${Date.now()}`, date: new Date().toISOString() };
  await storage.setItem(RECEIPTS_KEY, JSON.stringify([entry, ...list]));
}
