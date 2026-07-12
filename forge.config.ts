import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    extraResource: [
      './data'
    ],
    appBundleId: 'app.shogunos.desktop',
    appCopyright: `Copyright © ${new Date().getFullYear()} ShogunOS`,
    // These show up in Windows' file Properties → Details tab. Right now
    // that tab shows generic/blank fields, which is one of the small "does
    // a real company make this" signals people notice on unsigned software.
    win32metadata: {
      CompanyName: 'ShogunOS',
      FileDescription: 'ShogunOS — Multilingual Worship Presentation Software',
      ProductName: 'ShogunOS',
      OriginalFilename: 'ShogunOS.exe',
    },
    // ── CODE SIGNING (Windows) ────────────────────────────────────────────
    // Inactive until a real certificate is available — building without
    // these env vars set produces an unsigned installer exactly as before,
    // so this is safe to leave in. Once you buy a code-signing certificate
    // (see the docs/PACKAGING.md note), set these two locally or as CI
    // secrets and signing turns on automatically, no code changes needed:
    //   WINDOWS_CERT_FILE      — path to your .pfx certificate file
    //   WINDOWS_CERT_PASSWORD  — its password
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: './assets/icon.ico',
      ...(process.env.WINDOWS_CERT_FILE ? {
        certificateFile: process.env.WINDOWS_CERT_FILE,
        certificatePassword: process.env.WINDOWS_CERT_PASSWORD,
      } : {}),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { icon: './assets/icon.png' } }),
    new MakerDeb({ options: { icon: './assets/icon.png' } }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;