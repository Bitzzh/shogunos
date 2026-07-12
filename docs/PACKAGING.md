# Packaging & Professional Polish Notes

## What changed in this pass

1. **`assets/icon.ico`** — regenerated with 7 embedded resolutions (16–256px)
   from the existing `icon_512.png`. The old file only had a single 16×16
   image, which looked blurry everywhere except the taskbar.
2. **`assets/icon.icns`** — new file; macOS previously had no icon at all
   and was falling back to the default Electron icon.
3. **`package.json`** — `productName` fixed to "ShogunOS" (was lowercase
   "shogunos"), and `description` fixed from the literal unedited
   Electron Forge scaffold default ("My Electron application description")
   to a real one-line description. `author` changed to "ShogunOS" — change
   this back to your own name/company if you'd rather that show up in the
   Properties/Info dialogs instead.
4. **`forge.config.ts`** — added `win32metadata` (CompanyName, FileDescription,
   ProductName) so Windows' file Properties → Details tab shows real
   information instead of blank/generic fields. Also added `appCopyright`
   and a proper `appBundleId`. Windows code-signing support was wired in
   but stays completely inactive unless you set the env vars below — it
   changes nothing about today's unsigned build.

## Fixing the Windows "unknown publisher" warning

This warning (the blue SmartScreen box saying "Windows protected your PC")
shows up because the installer isn't cryptographically signed with a
certificate Windows trusts. There's no free way around this — it requires
buying a code-signing certificate from a Certificate Authority and proving
your identity to them. Two real options:

- **Traditional OV code-signing certificate** (~$70–250/year from
  SSL.com, Sectigo, DigiCert, etc.) — removes the "unknown publisher" text,
  but SmartScreen still shows a milder warning until your certificate
  builds up enough download reputation (can take weeks).
- **EV code-signing certificate** (~$300–500/year) — removes the
  SmartScreen warning immediately, no reputation-building period, but
  costs more and requires stricter identity verification (sometimes a
  notarized document or business registration).
- **Microsoft Trusted Signing** (newer, ~$10/month) — cheaper monthly
  option now available directly through Azure, worth looking at first
  since it's significantly less expensive than a yearly certificate.

Once you have a `.pfx` certificate file, set these two environment
variables before running `npm run make` (or as GitHub Actions secrets, for
the automated release workflow):

```
WINDOWS_CERT_FILE=/path/to/your/certificate.pfx
WINDOWS_CERT_PASSWORD=your-certificate-password
```

Signing turns on automatically — no code changes needed.

## macOS equivalent (Gatekeeper)

macOS has its own version of this problem: unsigned/unnotarized apps show
"cannot be opened because the developer cannot be verified." Fixing it
requires an active Apple Developer Program membership ($99/year) plus
notarizing each build with Apple. Not wired up yet since it's a separate
piece of infrastructure — worth doing once Windows signing is sorted, if
Mac users are a meaningful part of your audience.
