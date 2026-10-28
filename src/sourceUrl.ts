import { sourceUrlFromHtmlFormat } from "./sites";

/** The part of a Node `Buffer` this module reads; Electron returns Buffers from the clipboard. */
interface ClipboardBuffer {
  length: number;
  toString(encoding: "utf8" | "latin1"): string;
}

/** The synchronous reads of Electron's clipboard API this module uses. */
interface ElectronClipboard {
  read(format: string): string;
  readBuffer(format: string): ClipboardBuffer;
}

/** Electron's clipboard, or `null` where there's no Electron, as on mobile. */
function electronClipboard(): ElectronClipboard | null {
  try {
    const load = (window as { require?: (id: string) => unknown }).require;
    const electron = load?.("electron") as { clipboard?: ElectronClipboard } | undefined;
    return electron?.clipboard ?? null;
  } catch {
    return null;
  }
}

/** The value if it's an `http(s)` address, else `null`. */
function httpUrl(value: string | null | undefined): string | null {
  const url = value?.replace(/\0/g, "").trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Runs one clipboard read, treating a failure as "nothing there". */
function attempt<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

/**
 * Reads a clipboard format as a buffer. Electron names some Windows formats with a prefix, so the
 * prefixed name is tried when the plain one comes back empty.
 */
function readBuffer(clipboard: ElectronClipboard, format: string): ClipboardBuffer | null {
  const plain = attempt(() => clipboard.readBuffer(format));
  if (plain && plain.length > 0) return plain;
  const prefixed = attempt(() =>
    clipboard.readBuffer(`electron application/osclipboard;format="${format}"`),
  );
  return prefixed && prefixed.length > 0 ? prefixed : null;
}

/**
 * Safari's `com.apple.webarchive` is a binary property list whose main resource carries the page
 * address under `WebResourceURL`. Rather than decode the plist, take the first address after
 * that key, which is the main resource's in the archives Safari writes.
 */
function urlFromWebArchive(archive: ClipboardBuffer): string | null {
  const text = archive.toString("latin1");
  const key = text.indexOf("WebResourceURL");
  const searchFrom = key === -1 ? 0 : key;
  // eslint-disable-next-line no-control-regex -- the plist's binary framing around the address is control bytes, so they mark where it ends
  const match = /https?:\/\/[^\s<>"'\x00-\x1f]+/.exec(text.slice(searchFrom));
  return httpUrl(match?.[0]);
}

/**
 * Reads the address of the page the clipboard's contents were copied from, synchronously, so it
 * can be checked while the paste event is still being handled. Tries, in turn, the `SourceURL:`
 * line of Windows' `HTML Format`, Chromium's `org.chromium.source-url` on macOS and Linux, and
 * Safari's web archive. Returns `null` without Electron (mobile), or when no browser recorded an
 * `http(s)` address.
 */
export function readSourceUrl(): string | null {
  const clipboard = electronClipboard();
  if (!clipboard) return null;

  const htmlFormat = readBuffer(clipboard, "HTML Format");
  const fromHtmlFormat =
    htmlFormat && httpUrl(sourceUrlFromHtmlFormat(htmlFormat.toString("utf8")));
  if (fromHtmlFormat) return fromHtmlFormat;

  const fromChromium = httpUrl(attempt(() => clipboard.read("org.chromium.source-url")));
  if (fromChromium) return fromChromium;

  const archive = attempt(() => clipboard.readBuffer("com.apple.webarchive"));
  return archive && archive.length > 0 ? urlFromWebArchive(archive) : null;
}
