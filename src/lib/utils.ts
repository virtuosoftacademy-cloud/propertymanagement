import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Address ──────────────────────────────────────────────────────────────────

/**
 * Format address object to string
 */
export function formatAddress(address: any): string {
  if (typeof address === "string") return address;
  if (!address || typeof address !== "object") return "Address not available";

  const { street, city, state, zipCode, country } = address;
  if (!street || !city || !state || !zipCode) return "Incomplete address";

  return `${street}, ${city}, ${state} ${zipCode}${country ? `, ${country}` : ""}`;
}

// ─── Phone ────────────────────────────────────────────────────────────────────

/**
 * Validates a UK phone number.
 * Accepts:
 *   - 07700 900000  (mobile, 11 digits)
 *   - 01632 960000  (landline, 10–11 digits)
 *   - +44 7700 900000
 *   - +447700900000
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;

  const cleaned = phone.replace(/[\s\-().]/g, "");

  // International format starting with +44
  if (cleaned.startsWith("+44")) {
    const local = cleaned.slice(3);              // strip +44
    return /^[1-9]\d{8,9}$/.test(local);        // 9–10 digits, not starting with 0
  }

  // Local UK format — 10 or 11 digits starting with 0
  if (cleaned.startsWith("0")) {
    return /^0\d{9,10}$/.test(cleaned);
  }

  return false;
}

/**
 * Formats a raw number string into UK display format.
 * Examples:
 *   07700900000  → 07700 900000
 *   01632960000  → 01632 960000
 *   +447700900000 → +44 7700 900000
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";

  const cleaned = phone.replace(/[\s\-().]/g, "");

  // +44 international
  if (cleaned.startsWith("+44")) {
    const local = cleaned.slice(3);

    // Mobile: +44 7xxx xxxxxx  (7 digits groups: 4+6)
    if (/^7\d{9}$/.test(local)) {
      return `+44 ${local.slice(0, 4)} ${local.slice(4)}`;
    }

    // Landline: +44 1xxx/2xxx xxxxxx  (groups: 4+6 or 3+7)
    if (/^[123]\d{8,9}$/.test(local)) {
      const mid = local.length === 9 ? 4 : 5;
      return `+44 ${local.slice(0, mid)} ${local.slice(mid)}`;
    }

    return `+44 ${local}`;
  }

  // Mobile 07xxx (11 digits)
  if (/^07\d{9}$/.test(cleaned)) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }

  // Landline 01/02/03 (10–11 digits)
  if (/^0[123]\d{8,9}$/.test(cleaned)) {
    const mid = cleaned.length === 10 ? 4 : 5;
    return `${cleaned.slice(0, mid)} ${cleaned.slice(mid)}`;
  }

  return phone; // return as-is if pattern not recognised
}

/**
 * Normalises a phone number — strips formatting but keeps + prefix.
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";
  if (phone.startsWith("+")) return "+" + phone.slice(1).replace(/\D/g, "");
  return phone.replace(/\D/g, "");
}

// ─── Date ─────────────────────────────────────────────────────────────────────

/**
 * Formats a date to a readable UK-style string.
 * Example: 25 May 2026, 14:30
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "N/A";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return "Invalid Date";

    return dateObj.toLocaleDateString("en-GB", {
      year:   "numeric",
      month:  "short",
      day:    "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Invalid Date";
  }
}

// ─── Input key handlers ───────────────────────────────────────────────────────

/** Keys that should always pass through regardless of the field rule */
const PASS_THROUGH_KEYS = [
  "Backspace", "Delete", "Tab", "Enter",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Home", "End",
];

/**
 * Restricts an input to alphabetic characters, spaces, hyphens and apostrophes.
 * Use on: firstName, lastName, city, emergencyContact.name, relationship
 */
export function allowAlphabetsOnly(e: React.KeyboardEvent<HTMLInputElement>): void {
  if (PASS_THROUGH_KEYS.includes(e.key)) return;
  if (!/^[a-zA-Z\s''-]$/.test(e.key)) e.preventDefault();
}

/**
 * Restricts an input to digits, +, - and spaces.
 * Use on: phone, emergencyContact.phone
 */
export function allowNumbersOnly(e: React.KeyboardEvent<HTMLInputElement>): void {
  if (PASS_THROUGH_KEYS.includes(e.key)) return;
  if (!/^[0-9+\-\s]$/.test(e.key)) e.preventDefault();
}

/**
 * Restricts an input to alphanumeric characters and common punctuation.
 * Use on: location, jobTitle, company
 */
export function allowAlphanumericAndBasic(e: React.KeyboardEvent<HTMLInputElement>): void {
  if (PASS_THROUGH_KEYS.includes(e.key)) return;
  if (!/^[a-zA-Z0-9\s,.'"\-&]$/.test(e.key)) e.preventDefault();
}