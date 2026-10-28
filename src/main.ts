import type { EditorView } from "@codemirror/view";
import { type Editor, Plugin, type Vault } from "obsidian";
import { findCitationLinks, hasMediaWikiCitationMarkup } from "./citations";
import { PasteFixer } from "./pasteFix";
import { readSettings, type WikipediaHelperSettings } from "./settings";
import { WikipediaHelperSettingTab } from "./settingTab";
import { hostMatches } from "./sites";
import { readSourceUrl } from "./sourceUrl";

/** Obsidian's `Editor` wraps a CodeMirror view, which it exposes, undocumented, as `cm`. */
type EditorWithView = Editor & { cm?: EditorView };

/** `Vault.getConfig` reads Obsidian's own settings; it isn't in the public API. */
type VaultWithConfig = Vault & { getConfig?: (key: string) => unknown };

/**
 * Wikipedia Helper: keeps citation links such as `[4]` clickable when pasting from Wikipedia.
 * Obsidian's paste runs untouched; for pastes from a listed site, the plugin escapes the brackets
 * of the citation links it found in the copied HTML, inside the paste's own editor change.
 */
export default class WikipediaHelperPlugin extends Plugin {
  override settings: WikipediaHelperSettings = readSettings(null);
  private readonly fixer = new PasteFixer();

  override async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.registerEditorExtension(this.fixer.extension);
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor) => this.handlePaste(evt, editor)),
    );
    this.addSettingTab(new WikipediaHelperSettingTab(this.app, this));
  }

  override onunload(): void {
    this.fixer.disarm();
  }

  /** Saves the current settings to the plugin's `data.json`. */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Decides whether a paste is one to fix and, if it is, arms the fixer for the editor change
   * Obsidian's paste is about to make. It never cancels the paste or changes the event, so
   * Obsidian and other paste plugins see it exactly as they would without this plugin.
   */
  private handlePaste(evt: ClipboardEvent, editor: Editor): void {
    try {
      if (!this.settings.enabled || evt.defaultPrevented) return;
      const data = evt.clipboardData;
      if (!data || data.files.length > 0) return;
      const html = data.getData("text/html");
      if (!html || !this.autoConvertHtml()) return;
      const view = (editor as EditorWithView).cm;
      if (!view) return;

      const root = new DOMParser().parseFromString(html, "text/html");
      const links = findCitationLinks(root);
      if (links.length === 0) return;
      if (!this.sourceAllowed(root)) return;

      this.fixer.arm(view, links);
    } catch (error) {
      // Nothing has been cancelled, so Obsidian's paste goes ahead unfixed.
      console.error("Wikipedia Helper: couldn't check the paste", error);
    }
  }

  /**
   * Whether the paste's source page lets the fix apply: any page with "any site" on; otherwise a
   * page on a listed site, or, when the page is unknown, whatever the unknown-source setting says.
   */
  private sourceAllowed(root: ParentNode): boolean {
    if (this.settings.anySite) return true;
    const url = readSourceUrl();
    if (url) return hostMatches(url, this.settings.sites);
    return this.settings.unknownSource === "citation-markup" && hasMediaWikiCitationMarkup(root);
  }

  /**
   * Obsidian's Settings → Editor → Auto convert HTML switch. With it off, a paste inserts plain
   * text and there's nothing to fix. If the setting can't be read, it's treated as on, its default.
   */
  private autoConvertHtml(): boolean {
    return (this.app.vault as VaultWithConfig).getConfig?.("autoConvertHtml") !== false;
  }
}
