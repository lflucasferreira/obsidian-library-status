import { App, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";

interface StatusIconsSettings {
	frontmatterField: string;
	mappingText: string;
}

const DEFAULT_SETTINGS: StatusIconsSettings = {
	frontmatterField: "status",
	mappingText: ["lendo: 📖", "planejado: 🗓️", "lido: ✅", "abandonado: ⏸️", "desejado: 🛒"].join(
		"\n"
	),
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

// Minimal shape of Obsidian's internal (undocumented) FileExplorer view/items.
interface InternalFileItem {
	selfEl: HTMLElement;
}
interface InternalFileExplorerView {
	fileItems: Record<string, InternalFileItem>;
}

export default class StatusIconsPlugin extends Plugin {
	settings: StatusIconsSettings;
	private mapping: Record<string, string> = {};
	private badges: Map<string, HTMLElement> = new Map();
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
		this.badges.forEach((el) => el.remove());
		this.badges.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.mapping = parseMapping(this.settings.mappingText);
	}

	async saveSettings() {
		this.mapping = parseMapping(this.settings.mappingText);
		await this.saveData(this.settings);
		this.queueRefresh();
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

	private refreshAll() {
		const views = this.getFileExplorerViews();
		if (views.length === 0) return;

		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const rawStatus = cache?.frontmatter?.[this.settings.frontmatterField];
			const icon = rawStatus ? this.mapping[String(rawStatus).toLowerCase()] : undefined;
			this.applyIcon(views, file.path, icon);
		}
	}

	private applyIcon(views: InternalFileExplorerView[], path: string, icon: string | undefined) {
		for (const view of views) {
			const item = view.fileItems[path];
			const existing = this.badges.get(path);

			if (!item) {
				// File row not rendered in this explorer instance right now.
				continue;
			}

			if (!icon) {
				if (existing?.isConnected) existing.remove();
				this.badges.delete(path);
				continue;
			}

			if (existing?.isConnected && existing.parentElement === item.selfEl) {
				if (existing.textContent !== icon) existing.setText(icon);
				continue;
			}

			existing?.remove();
			const badge = item.selfEl.createSpan({ cls: "status-icon-badge", text: icon });
			item.selfEl.prepend(badge);
			this.badges.set(path, badge);
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

		new Setting(containerEl)
			.setName("Campo do frontmatter")
			.setDesc("Nome do campo usado para escolher o ícone (ex: status).")
			.addText((text) =>
				text.setValue(this.plugin.settings.frontmatterField).onChange(async (value) => {
					this.plugin.settings.frontmatterField = value.trim() || "status";
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Mapeamento valor → ícone")
			.setDesc(
				"Uma linha por valor, no formato 'valor: ícone'. Valores não listados aqui não recebem ícone."
			)
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text.inputEl.cols = 30;
				text.setValue(this.plugin.settings.mappingText).onChange(async (value) => {
					this.plugin.settings.mappingText = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
