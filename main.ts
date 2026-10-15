import { App, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";

interface StatusIconsSettings {
	statusField: string;
	statusMappingText: string;
	formatField: string;
	formatMappingText: string;
	platformField: string;
	platformMappingText: string;
	tagsField: string;
	tagsMappingText: string;
	goalField: string;
	goalPrefix: string;
}

const DEFAULT_SETTINGS: StatusIconsSettings = {
	statusField: "status",
	statusMappingText: ["lendo: 📖", "planejado: 📌", "lido: ✅", "abandonado: ❌", "relendo: 🔁"].join(
		"\n"
	),
	formatField: "formato",
	formatMappingText: ["físico: 🔖", "digital: 🖥️", "pdf: 📄"].join("\n"),
	platformField: "plataforma",
	platformMappingText: ["amazon: 📦", "kindle: 📦", "google livros: 📘", "google play books: 📘"].join(
		"\n"
	),
	tagsField: "etiquetas",
	tagsMappingText: ["favorito: ❤️", "desejado: 🎁", "tenho: ✔️", "emprestei: ➡️"].join("\n"),
	goalField: "objetivo",
	goalPrefix: "🎯",
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

/**
 * Like toStringArray, but also splits legacy scalar values written as
 * "digital + físico" or "físico, digital" into separate tokens — needed for a
 * field like `formato` where older notes combined multiple values in one string
 * instead of a proper YAML list.
 */
function toStringArraySplitting(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) {
		return value
			.map((v) => String(v).trim())
			.filter(Boolean);
	}
	return String(value)
		.split(/[+,]/)
		.map((v) => v.trim())
		.filter(Boolean);
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
	private formatMapping: Record<string, string> = {};
	private platformMapping: Record<string, string> = {};
	private tagsMapping: Record<string, string> = {};
	/** Status icon, prepended to the left of the filename (one per file). */
	private statusEls: Map<string, HTMLElement> = new Map();
	/** Etiqueta icons + objetivo badge, appended to the right edge (same spot as the native bookmark marker). */
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
		this.formatMapping = parseMapping(this.settings.formatMappingText);
		this.platformMapping = parseMapping(this.settings.platformMappingText);
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

	private formatIconsForFile(file: TFile): string[] {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const values = toStringArraySplitting(frontmatter?.[this.settings.formatField]);
		const icons: string[] = [];
		for (const value of values) {
			const icon = this.formatMapping[value.toLowerCase()];
			if (icon && !icons.includes(icon)) icons.push(icon);
		}
		return icons;
	}

	private platformIconsForFile(file: TFile): string[] {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const values = toStringArraySplitting(frontmatter?.[this.settings.platformField]);
		const icons: string[] = [];
		for (const value of values) {
			const icon = this.platformMapping[value.toLowerCase()];
			if (icon && !icons.includes(icon)) icons.push(icon);
		}
		return icons;
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

	/** Free-form value (ex: um ano), não um enum fixo — por isso não entra no mapeamento de ícones. */
	private goalBadgeForFile(file: TFile): string | undefined {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const raw = frontmatter?.[this.settings.goalField];
		if (raw === undefined || raw === null || raw === "") return undefined;
		const values = toStringArray(raw);
		if (values.length === 0) return undefined;
		return `${this.settings.goalPrefix}${values.join(", ")}`;
	}

	private refreshAll() {
		const views = this.getFileExplorerViews();
		if (views.length === 0) return;

		for (const file of this.app.vault.getMarkdownFiles()) {
			this.applyStatus(views, file.path, this.statusIconForFile(file));
			const rightSide = [
				...this.formatIconsForFile(file),
				...this.platformIconsForFile(file),
				...this.tagIconsForFile(file),
			];
			const goalBadge = this.goalBadgeForFile(file);
			if (goalBadge) rightSide.push(goalBadge);
			this.applyTags(views, file.path, rightSide);
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
			text: "Formato (pode ter vários valores ao mesmo tempo, à direita)",
		});

		new Setting(containerEl)
			.setName("Campo do frontmatter")
			.setDesc(
				"Campo de lista ou texto combinado (ex: formato: [físico, digital], ou 'digital + físico'). Todos os ícones presentes aparecem juntos, antes das etiquetas."
			)
			.addText((text) =>
				text.setValue(this.plugin.settings.formatField).onChange(async (value) => {
					this.plugin.settings.formatField = value.trim() || "formato";
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Mapeamento valor → ícone")
			.setDesc("Uma linha por valor, no formato 'valor: ícone'.")
			.addTextArea((text) => {
				text.inputEl.rows = 4;
				text.inputEl.cols = 30;
				text.setValue(this.plugin.settings.formatMappingText).onChange(async (value) => {
					this.plugin.settings.formatMappingText = value;
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl("h3", {
			text: "Plataforma digital (onde está o arquivo, à direita, depois do formato)",
		});

		new Setting(containerEl)
			.setName("Campo do frontmatter")
			.setDesc(
				"Campo de lista ou texto combinado (ex: plataforma: amazon, ou plataforma: [amazon, google livros])."
			)
			.addText((text) =>
				text.setValue(this.plugin.settings.platformField).onChange(async (value) => {
					this.plugin.settings.platformField = value.trim() || "plataforma";
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Mapeamento valor → ícone")
			.setDesc("Uma linha por valor, no formato 'valor: ícone'.")
			.addTextArea((text) => {
				text.inputEl.rows = 5;
				text.inputEl.cols = 30;
				text.setValue(this.plugin.settings.platformMappingText).onChange(async (value) => {
					this.plugin.settings.platformMappingText = value;
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

		containerEl.createEl("h3", {
			text: "Objetivo (valor livre, ex: ano — à direita, junto das etiquetas)",
		});

		new Setting(containerEl)
			.setName("Campo do frontmatter")
			.setDesc(
				"Campo escalar ou lista sem valores fixos (ex: objetivo: 2026). O valor aparece como texto, não precisa de mapeamento."
			)
			.addText((text) =>
				text.setValue(this.plugin.settings.goalField).onChange(async (value) => {
					this.plugin.settings.goalField = value.trim() || "objetivo";
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Prefixo exibido antes do valor")
			.setDesc("Ex: 🎯 → nota com objetivo: 2026 mostra '🎯2026'.")
			.addText((text) =>
				text.setValue(this.plugin.settings.goalPrefix).onChange(async (value) => {
					this.plugin.settings.goalPrefix = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
