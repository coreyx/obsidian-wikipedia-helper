import { normalizeSites } from "./sites";

/**
 * What to do with a paste whose source page is unknown, because the browser didn't record it or
 * the platform can't read it: act only when the HTML has MediaWiki citation markup, or skip it.
 */
export type UnknownSourcePolicy = "citation-markup" | "skip";

/** The plugin's saved settings. */
export interface WikipediaHelperSettings {
  /** Whether pastes are fixed at all. The repair command works either way. */
  enabled: boolean;
  /** Bare hostnames whose pastes are fixed; each covers its subdomains. */
  sites: string[];
  /** What to do when the paste's source page is unknown. */
  unknownSource: UnknownSourcePolicy;
  /** Whether to fix pastes from any page, ignoring `sites` and `unknownSource`. */
  anySite: boolean;
}

/** The settings a new install starts with. */
export const DEFAULT_SETTINGS: Readonly<WikipediaHelperSettings> = {
  enabled: true,
  sites: ["wikipedia.org"],
  unknownSource: "citation-markup",
  anySite: false,
};

/**
 * Builds settings from whatever `loadData()` returned, keeping each saved value of the right type
 * and using the default for anything missing or malformed, so a hand-edited or older `data.json`
 * can't break the plugin.
 */
export function readSettings(data: unknown): WikipediaHelperSettings {
  const saved = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const sites = Array.isArray(saved.sites)
    ? normalizeSites(saved.sites.filter((site): site is string => typeof site === "string"))
    : [...DEFAULT_SETTINGS.sites];
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_SETTINGS.enabled,
    sites,
    unknownSource:
      saved.unknownSource === "citation-markup" || saved.unknownSource === "skip"
        ? saved.unknownSource
        : DEFAULT_SETTINGS.unknownSource,
    anySite: typeof saved.anySite === "boolean" ? saved.anySite : DEFAULT_SETTINGS.anySite,
  };
}
