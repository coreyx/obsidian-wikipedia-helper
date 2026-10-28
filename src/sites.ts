/**
 * Reduces a site entry as a user might type it (`https://www.Example.org/wiki`) to the bare
 * hostname the matcher compares against (`example.org`). Returns an empty string when nothing
 * usable is left, so callers can drop the entry.
 */
export function normalizeSite(entry: string): string {
  let site = entry.trim().toLowerCase();
  site = site.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  site = site.replace(/[/?#].*$/, "");
  site = site.replace(/:\d*$/, "");
  site = site.replace(/^www\./, "");
  site = site.replace(/\.+$/, "");
  return site;
}

/** Normalizes every entry of a site list, dropping empty entries and duplicates, in order. */
export function normalizeSites(entries: readonly string[]): string[] {
  const sites: string[] = [];
  for (const entry of entries) {
    const site = normalizeSite(entry);
    if (site && !sites.includes(site)) sites.push(site);
  }
  return sites;
}

/**
 * Says whether a page address belongs to one of the listed sites. A site covers its subdomains,
 * so `wikipedia.org` matches `en.wikipedia.org` and `en.m.wikipedia.org`, but not
 * `notwikipedia.org`. An address that can't be parsed matches nothing.
 */
export function hostMatches(url: string, sites: readonly string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  if (!hostname) return false;
  return sites.some((entry) => {
    const site = normalizeSite(entry);
    return site !== "" && (hostname === site || hostname.endsWith(`.${site}`));
  });
}
