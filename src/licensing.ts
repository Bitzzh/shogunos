import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// ── CONFIG ───────────────────────────────────────────────────────────────────
// Lemon Squeezy acts as merchant-of-record: it handles global sales tax/VAT
// and gives us a hosted license-key API for free, so we don't need to run our
// own license server. Swap in your real store/product IDs before shipping.
// ── OWNER OVERRIDE ───────────────────────────────────────────────────────────
// Lets the app's owner (you) unlock every feature on your own installs
// without going through Lemon Squeezy at all — no network call, no expiry,
// no per-machine activation limit. Entered into the same "license key" field
// as a normal customer license key.
//
// IMPORTANT: change this passphrase before you ship builds to anyone else,
// and keep it out of anywhere customers could read it (it's only as secret
// as your source/compiled app — treat it as a convenience lock, not DRM).
// Default passphrase (change it!): shogunos-owner-9427
// To set a new one: pick a long passphrase, then replace OWNER_KEY_HASH with
// the output of:
//   node -e "console.log(require('crypto').createHash('sha256').update('YOUR_NEW_PASSPHRASE').digest('hex'))"
const OWNER_KEY_HASH = 'cfc66fe41a500a237613dd7101d78d725723d9254929713cab3e9601876bc6c8'
function isOwnerKey(key: string): boolean {
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  const a = Buffer.from(hash); const b = Buffer.from(OWNER_KEY_HASH)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1'
export const PURCHASE_URL = 'https://shogunos.lemonsqueezy.com/buy/pro-license' // TODO: replace with real checkout URL once the product exists

// How long a previously-validated license keeps working with no internet
// access. Long enough that a church without wifi on a Sunday isn't locked
// out mid-service; short enough that a refunded/revoked key stops working
// within a reasonable window.
const OFFLINE_GRACE_DAYS = 21
// How often we re-check with Lemon Squeezy even when everything looks fine.
const REVALIDATE_INTERVAL_DAYS = 3

export type LicenseTier = 'free' | 'pro'

export interface LicenseRecord {
  key: string | null
  instanceId: string | null
  instanceName: string
  tier: LicenseTier
  status: 'inactive' | 'active' | 'expired' | 'invalid' | 'owner'
  lastValidatedAt: string | null
  lastValidResult: boolean
  activatedAt: string | null
  customerEmail: string | null
  error: string | null
  isOwner: boolean
}

const DEFAULTS: LicenseRecord = {
  key: null, instanceId: null, instanceName: 'ShogunOS',
  tier: 'free', status: 'inactive',
  lastValidatedAt: null, lastValidResult: false,
  activatedAt: null, customerEmail: null, error: null,
  isOwner: false,
}

function licensePath() {
  return path.join(app.getPath('userData'), 'license.json')
}

function loadRecord(): LicenseRecord {
  try {
    const raw = fs.readFileSync(licensePath(), 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS, instanceId: instanceIdFor() }
  }
}

function saveRecord(rec: LicenseRecord) {
  fs.writeFileSync(licensePath(), JSON.stringify(rec, null, 2), 'utf-8')
}

// A stable per-install identifier, used as the Lemon Squeezy "instance" so a
// single license key can be limited to N simultaneous machines and users can
// see which machine is which when managing their license from LS's portal.
function instanceIdFor(): string {
  const p = path.join(app.getPath('userData'), 'instance-id')
  try { return fs.readFileSync(p, 'utf-8').trim() } catch {}
  const id = crypto.randomUUID()
  try { fs.writeFileSync(p, id, 'utf-8') } catch {}
  return id
}

let cached: LicenseRecord | null = null
function get(): LicenseRecord {
  if (!cached) cached = loadRecord()
  return cached
}
function set(rec: LicenseRecord) {
  cached = rec
  saveRecord(rec)
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

// ── PUBLIC API ───────────────────────────────────────────────────────────────

// Called on app launch. Re-validates in the background if it's been a while,
// but never blocks startup on a network call — a church with no signal on a
// Sunday morning should never be locked out of software they paid for.
export async function getLicenseStatus(): Promise<LicenseRecord> {
  const rec = get()
  if (rec.isOwner) return rec // owner access never expires and never touches the network
  if (rec.key && rec.instanceId && daysSince(rec.lastValidatedAt) > REVALIDATE_INTERVAL_DAYS) {
    validateInBackground(rec)
  }
  return applyGracePeriod(rec)
}

// If it's been validated recently, trust it. If it's stale, still allow it
// for OFFLINE_GRACE_DAYS past the last successful check — after that, fall
// back to free tier until we can reach Lemon Squeezy again.
function applyGracePeriod(rec: LicenseRecord): LicenseRecord {
  if (rec.isOwner) return rec
  if (rec.tier !== 'pro') return rec
  if (rec.lastValidResult && daysSince(rec.lastValidatedAt) <= OFFLINE_GRACE_DAYS) return rec
  if (rec.lastValidResult) return rec // still within async re-check window, treat as valid until proven otherwise
  return { ...rec, tier: 'free', status: 'expired' }
}

async function validateInBackground(rec: LicenseRecord) {
  try {
    const res = await fetch(`${LS_API_BASE}/licenses/validate`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: rec.key, instance_id: rec.instanceId }),
    })
    const data = await res.json().catch(() => null)
    const valid = !!data?.valid
    set({
      ...rec,
      tier: valid ? 'pro' : 'free',
      status: valid ? 'active' : 'invalid',
      lastValidatedAt: new Date().toISOString(),
      lastValidResult: valid,
      customerEmail: data?.meta?.customer_email ?? rec.customerEmail,
      error: valid ? null : (data?.error ?? 'License is no longer valid'),
    })
  } catch {
    // Network failure — leave the cached record alone; applyGracePeriod()
    // decides whether the grace period has run out.
  }
}

export async function activateLicense(key: string): Promise<{ success: boolean; error?: string; tier?: LicenseTier }> {
  const trimmed = key.trim()
  if (!trimmed) return { success: false, error: 'Enter a license key' }

  if (isOwnerKey(trimmed)) {
    set({
      ...DEFAULTS,
      key: 'OWNER-ACCESS', instanceId: instanceIdFor(), instanceName: 'Owner',
      tier: 'pro', status: 'owner',
      lastValidatedAt: new Date().toISOString(), lastValidResult: true,
      activatedAt: new Date().toISOString(),
      isOwner: true,
    })
    return { success: true, tier: 'pro' }
  }

  const instanceId = instanceIdFor()
  try {
    const res = await fetch(`${LS_API_BASE}/licenses/activate`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: trimmed, instance_name: `ShogunOS-${instanceId.slice(0, 8)}` }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.activated) {
      return { success: false, error: data?.error || 'Could not activate this license key' }
    }
    set({
      key: trimmed,
      instanceId: data.instance?.id ?? instanceId,
      instanceName: data.instance?.name ?? `ShogunOS-${instanceId.slice(0, 8)}`,
      tier: 'pro', status: 'active',
      lastValidatedAt: new Date().toISOString(), lastValidResult: true,
      activatedAt: new Date().toISOString(),
      customerEmail: data.meta?.customer_email ?? null,
      error: null,
      isOwner: false,
    })
    return { success: true, tier: 'pro' }
  } catch {
    return { success: false, error: 'Could not reach the license server — check your internet connection and try again' }
  }
}

export async function deactivateLicense(): Promise<{ success: boolean; error?: string }> {
  const rec = get()
  if (rec.isOwner || !rec.key || !rec.instanceId) { set({ ...DEFAULTS, instanceId: instanceIdFor() }); return { success: true } }
  try {
    await fetch(`${LS_API_BASE}/licenses/deactivate`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: rec.key, instance_id: rec.instanceId }),
    })
  } catch {
    // Even if Lemon Squeezy is unreachable, remove it locally — the user
    // asked to deactivate on this machine, so honor that regardless.
  }
  set({ ...DEFAULTS, instanceId: instanceIdFor() })
  return { success: true }
}

// ── FREE-TIER LIMITS ─────────────────────────────────────────────────────────
// Centralized here so the renderer and main process agree on exactly what
// "free" means. Keep this list short and the value of Pro obvious.
export const FREE_TIER_LIMITS = {
  // Free tier gets the SDA hymnal plus one CIS language of the user's choice;
  // every additional CIS language requires Pro.
  maxFreeHymnalLanguages: 1,
  // Free tier can project images only; video/audio playback to the live
  // output is a Pro feature.
  liveVideoEnabled: false,
  liveAudioEnabled: false,
  // Free tier is single-display only; sending output to a second monitor
  // (the church's projector/stage display) is Pro.
  multiDisplayEnabled: false,
}