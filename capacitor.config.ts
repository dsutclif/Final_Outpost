import { readFileSync } from "node:fs";
import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor wrap of the web build (docs/RELEASE.md section 3). The app name and colours come
// from the launch skin; the config reads the skin source as text because the Capacitor CLI
// transpiles this one file and cannot follow TypeScript imports.
const skinSrc = (() => { try { return readFileSync("packages/skins/src/mars_greenhouse.ts", "utf8"); } catch { return ""; } })();
const pick = (re: RegExp, fallback: string): string => re.exec(skinSrc)?.[1] ?? fallback;
const skinName = pick(/\bname:\s*"([^"]+)"/, "Mars Greenhouse");
const background = pick(/\bbg:\s*"(#[0-9a-fA-F]{6})"/, "#3a2219");

const config: CapacitorConfig = {
  appId: "com.module12.farthestoutpost",
  appName: `Farthest Outpost: ${skinName}`,
  webDir: "packages/client/dist",
  backgroundColor: background,
  ios: {
    // the shell lays out under the notch with env(safe-area-inset-*) itself
    contentInset: "never",
    backgroundColor: background,
    preferredContentMode: "mobile",
    scrollEnabled: false,
  },
  android: {
    backgroundColor: background,
  },
  plugins: {
    StatusBar: { style: "DARK", backgroundColor: background, overlaysWebView: true },
    SplashScreen: { launchShowDuration: 0, backgroundColor: background },
  },
};

export default config;
