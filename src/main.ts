import type { EditorView } from "@codemirror/view";
import { type Editor, Notice, Plugin, type Vault } from "obsidian";
import { findCitationLinks, hasMediaWikiCitationMarkup, repairMangledLinks } from "./citations";
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
 * The paste runs untouched, whether Obsidian or another plugin handles it; for pastes from a listed
 * site, the plugin escapes the brackets of the citation links it found in the copied HTML, inside
 * the paste's own editor change.
 */
export default class WikipediaHelperPlugin extends Plugin {
  override settings: WikipediaHelperSettings = readSettings(null);
  private readonly fixer = new PasteFixer();
  private readonly onPaste = (evt: ClipboardEvent): void => this.handlePaste(evt);

  override async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.registerEditorExtension(this.fixer.extension);
    // In the capture phase on the document, the check runs before CodeMirror and every plugin's
    // `editor-paste` handler, whatever order the plugins loaded in, so a plugin that takes the
    // paste and inserts its own conversion, such as Table Formatter, still gets its citations fixed.
    this.registerDomEvent(document, "paste", this.onPaste, { capture: true });
    this.registerEvent(
      this.app.workspace.on("window-open", (_win, popout) =>
        this.registerDomEvent(popout.document, "paste", this.onPaste, { capture: true }),
      ),
    );
    this.addCommand({
      id: "repair-citation-links",
      name: "Repair citation links in selection or note",
      editorCallback: (editor) => this.repairCitationLinks(editor),
    });
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
   * Decides whether a paste into the active note's editor is one to fix and, if it is, arms the
   * fixer for the editor change the paste is about to make, by Obsidian or by a plugin that takes
   * the paste. It runs before either, and never cancels the paste or stops the event, so Obsidian
   * and other paste plugins see it exactly as they would without this plugin.
   */
  private handlePaste(evt: ClipboardEvent): void {
    try {
      // Only an earlier capture listener could have cancelled the paste by now; if one did,
      // nothing will be inserted.
      if (!this.settings.enabled || evt.defaultPrevented) return;
      const view = (this.app.workspace.activeEditor?.editor as EditorWithView | undefined)?.cm;
      // Pastes into anything else, such as a settings field or the search box, aren't for notes.
      if (!view || !view.contentDOM.contains(evt.target as Node | null)) return;
      const data = evt.clipboardData;
      if (!data || data.files.length > 0) return;
      const html = data.getData("text/html");
      if (!html || !this.autoConvertHtml()) return;

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
   * Repairs citation links pasted the broken way, in the selection if there is one, else in the
   * whole note. Only links to a listed site are changed, whatever the "any site" setting says,
   * because without the copied HTML a citation can't be told from a wikilink followed by a link.
   * The backslashes go in as one editor transaction, so one undo restores the text.
   */
  private repairCitationLinks(editor: Editor): void {
    const hasSelection = editor.somethingSelected();
    const text = hasSelection ? editor.getSelection() : editor.getValue();
    const base = hasSelection ? editor.posToOffset(editor.getCursor("from")) : 0;
    const fix = repairMangledLinks(text, this.settings.sites);
    if (fix.count === 0) {
      new Notice("No broken citation links found.");
      return;
    }
    editor.transaction({
      changes: fix.escapeAt.map((offset) => ({
        from: editor.offsetToPos(base + offset),
        text: "\\",
      })),
    });
    new Notice(`Repaired ${fix.count} citation ${fix.count === 1 ? "link" : "links"}.`);
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
