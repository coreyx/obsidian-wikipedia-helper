import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, type WikipediaHelperSettings } from "./settings";
import { normalizeSites } from "./sites";

/** What the settings tab needs from the plugin: its settings, and a way to save them. */
export interface SettingsHost extends Plugin {
  settings: WikipediaHelperSettings;
  saveSettings(): Promise<void>;
}

/**
 * The plugin's tab under Settings → Community plugins. It renders with `display()` rather than
 * the declarative settings API, which needs Obsidian 1.13, because the plugin supports 1.4; the
 * lint warnings about that are expected.
 */
export class WikipediaHelperSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly host: SettingsHost,
  ) {
    super(app, host);
  }

  /** Renders the tab. Called again after the "any site" toggle, which enables or disables rows. */
  override display(): void {
    const { containerEl } = this;
    const settings = this.host.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Fix citation links on paste")
      .setDesc(
        "Keep links such as [4] clickable when pasting, instead of letting them become wikilinks.",
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.enabled).onChange(async (value) => {
          settings.enabled = value;
          await this.host.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Sites")
      .setDesc(
        "Pastes copied from these sites are fixed. One per line; each includes its subdomains, so wikipedia.org covers en.wikipedia.org. With no sites listed, only pastes whose source page is unknown can be fixed.",
      )
      .setDisabled(settings.anySite)
      .addTextArea((text) => {
        text
          // Not a site name: a placeholder that looks like an entry makes an empty list look
          // like the default one.
          .setPlaceholder("One site per line")
          .setValue(settings.sites.join("\n"))
          .setDisabled(settings.anySite)
          .onChange(async (value) => {
            settings.sites = normalizeSites(value.split("\n"));
            await this.host.saveSettings();
          });
        text.inputEl.rows = 4;
      })
      .addExtraButton((button) =>
        button
          .setIcon("rotate-ccw")
          .setTooltip("Restore default")
          .setDisabled(settings.anySite)
          .onClick(async () => {
            settings.sites = [...DEFAULT_SETTINGS.sites];
            await this.host.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("When the source site is unknown")
      .setDesc(
        "Some browsers don't record which page was copied, and on mobile it can't be read. Choose whether such pastes are fixed when they have Wikipedia's citation markup, or left alone.",
      )
      .setDisabled(settings.anySite)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("citation-markup", "Fix if it has Wikipedia citation markup")
          .addOption("skip", "Leave it alone")
          .setValue(settings.unknownSource)
          .setDisabled(settings.anySite)
          .onChange(async (value) => {
            settings.unknownSource = value === "skip" ? "skip" : "citation-markup";
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Fix citation links from any site")
      .setDesc(
        "Apply the same fix to bracketed links such as [4] copied from any page. The sites list and the unknown-source choice then don't apply. The repair command still uses the sites list.",
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.anySite).onChange(async (value) => {
          settings.anySite = value;
          await this.host.saveSettings();
          this.display();
        }),
      );
  }
}
