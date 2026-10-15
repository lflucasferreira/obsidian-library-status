import { App, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";

interface StatusIconsSettings {
	statusField: string;
	statusMappingText: string;
	tagsField: string;
	tagsMappingText: string;
}

const DEFAULT_SETTINGS: StatusIconsSettings = {
	statusField: "status",
	statusMappingText: ["lendo: 📖", "planejado: 📌", "lido: ✅", "abandonado: ❌", "desejado: ⭐"].join(
		"\n"
	),
	tagsField: "etiquetas",
	tagsMappingText: ["favorito: ❤️", "desejado: 🎁", "tenho: 🔖", "emprestei: ➡️"].join("\n"),
};

function parseMapping(mappingText: string): Record<string, string> {
	const mapping: Record<string, string> = {};
	for (const rawLine of mappingText.split("\n")) {
		const line = rawLine.trim();
		if (!line || !line.includes(":")) continue;
		const idx = line.indexOf(":");
		const key = line.slice(0, idx).trim().toLowerCase();
		const value = line.slice(idx + 1).trim();
		if (key && value) mapping[key] = value;
	}
	return mapping;
}

/** A frontmatter value can be a scalar or a YAML list; normalize to a string array. */
function toStringArray(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) return value.map((v) => String(v));
	return [String(value)];
}

// Minimal shape of Obsidian's internal (undocumented) FileExplorer view/items.
interface InternalFileItem {
	selfEl: HTMLElement;
}
interface InternalFileExplorerView {
	fileItems: Record<string, InternalFileItem>;
}

export default class StatusIconsPlugin extends Plugin {
	settings: StatusIconsSettings;
	private statusMapping: Record<string, string> = {};
	private tagsMapping: Record<string, string> = {};
	/** Status icon, prepended to the left of the filename (one per file). */
	private statusEls: Map<string, HTMLElement> = new Map();
	/** Tag icons, appended to the right edge of the row (same spot as the native bookmark marker). */
	private tagsEls: Map<string, HTMLElement> = new Map();
	private refreshQueued = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new StatusIconsSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => this.queueRefresh());

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile) this.queueRefresh();
			})
		);
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.queueRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => this.queueRefresh()));
		this.registerEvent(this.app.vault.on("create", () => this.queueRefresh()));
		this.registerEvent(this.app.vault.on("delete", () => this.queueRefresh()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.queueRefresh()));
	}

	onunload() {
		this.statusEls.forEach((el) => el.remove());
		this.statusEls.clear();
		this.tagsEls.forEach((el) => el.remove());
		this.tagsEls.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.rebuildMappings();
	}

	async saveSettings() {
		this.rebuildMappings();
		await this.saveData(this.settings);
		this.queueRefresh();
	}

	private rebuildMappings() {
		this.statusMapping = parseMapping(this.settings.statusMappingText);
		this.tagsMapping = parseMapping(this.settings.tagsMappingText);
	}

	/** Coalesce bursts of events (bulk rename, vault load) into a single pass. */
	private queueRefresh() {
		if (this.refreshQueued) return;
		this.refreshQueued = true;
		window.setTimeout(() => {
			this.refreshQueued = false;
			this.refreshAll();
		}, 50);
	}

	private getFileExplorerViews(): InternalFileExplorerView[] {
		return this.app.workspace
			.getLeavesOfType("file-explorer")
			.map((leaf: WorkspaceLeaf) => leaf.view as unknown as InternalFileExplorerView)
			.filter((view) => !!view?.fileItems);
	}

	private statusIconForFile(file: TFile): string | undefined {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const raw = frontmatter?.[this.settings.statusField];
		return raw ? this.statusMapping[String(raw).toLowerCase()] : undefined;
	}

	private tagIconsForFile(file: TFile): string[] {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const values = toStringArray(frontmatter?.[this.settings.tagsField]);
		const icons: string[] = [];
		for (const value of values) {
			const icon = this.tagsMapping[value.toLowerCase()];
			if (icon) icons.push(icon);
		}
		return icons;
	}

	private refreshAll() {
		const views = this.getFileExplorerViews();
		if (views.length === 0) return;

		for (const file of this.app.vault.getMarkdownFiles()) {
			this.applyStatus(views, file.path, this.statusIconForFile(file));
			this.applyTags(views, file.path, this.tagIconsForFile(file));
		}
	}

	private applyStatus(views: InternalFileExplorerView[], path: string, icon: string | undefined) {
		for (const view of views) {
			const item = view.fileItems[path];
			const existing = this.statusEls.get(path);
			if (!item) continue;

			if (!icon) {
				if (existing?.isConnected) existing.remove();
				this.statusEls.delete(path);
				continue;
			}

			if (existing?.isConnected && existing.parentElement === item.selfEl) {
				if (existing.textContent !== icon) existing.setText(icon);
				continue;
			}

			existing?.remove();
			const el = item.selfEl.createSpan({ cls: "status-icon-status", text: icon });
			item.selfEl.prepend(el);
			this.statusEls.set(path, el);
		}
	}

	private applyTags(views: InternalFileExplorerView[], path: string, icons: string[]) {
		for (const view of views) {
			const item = view.fileItems[path];
			const existing = this.tagsEls.get(path);
			if (!item) continue;

			if (icons.length === 0) {
				if (existing?.isConnected) existing.remove();
				this.tagsEls.delete(path);
				continue;
			}

			const signature = icons.join("|");

			if (
				existing?.isConnected &&
				existing.parentElement === item.selfEl &&
				existing.dataset.sig === signature
			) {
				continue;
			}

			existing?.remove();
			// Appended last, same slot the native bookmark marker occupies (right edge of the row).
			const wrapper = item.selfEl.createSpan({ cls: "status-icon-tags" });
			wrapper.dataset.sig = signature;
			for (const icon of icons) {
				wrapper.createSpan({ cls: "status-icon-tag", text: icon });
			}
			item.selfEl.append(wrapper);
			this.tagsEls.set(path, wrapper);
		}
	}
}

class StatusIconsSettingTab extends PluginSettingTab {
	plugin: StatusIconsPlugin;

	constructor(app: App, plugin: StatusIconsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h3", { text: "Status (estado de leitura, à esquerda do nome)" });

		new Setting(containerEl)
			.setName("Campo do frontmatter")
			.setDesc("Campo escalar usado para o estado de leitura (ex: status).")
			.addText((text) =>
				text.setValue(this.plugin.settings.statusField).onChange(async (value) => {
					this.plugin.settings.statusField = value.trim() || "status";
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Mapeamento valor → ícone")
			.setDesc("Uma linha por valor, no formato 'valor: ícone'.")
			.addTextArea((text) => {
				text.inputEl.rows = 6;
				text.inputEl.cols = 30;
				text.setValue(this.plugin.settings.statusMappingText).onChange(async (value) => {
					this.plugin.settings.statusMappingText = value;
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl("h3", {
			text: "Etiquetas (rótulos independentes, à direita — onde ficaria o marcador)",
		});

		new Setting(containerEl)
			.setName("Campo do frontmatter")
			.setDesc(
				"Campo de lista usado para rótulos extras (ex: etiquetas: [favorito, tenho]). Todos os rótulos presentes aparecem juntos, à direita."
			)
			.addText((text) =>
				text.setValue(this.plugin.settings.tagsField).onChange(async (value) => {
					this.plugin.settings.tagsField = value.trim() || "etiquetas";
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Mapeamento valor → ícone")
			.setDesc("Uma linha por valor, no formato 'valor: ícone'.")
			.addTextArea((text) => {
				text.inputEl.rows = 6;
				text.inputEl.cols = 30;
				text.setValue(this.plugin.settings.tagsMappingText).onChange(async (value) => {
					this.plugin.settings.tagsMappingText = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
