import { Notice, Plugin, TFile } from "obsidian";
import { createBasesViewRegistration } from "./src/basesView";
import { PickleCollectionService } from "./src/collectionService";
import { DEFAULT_SETTINGS } from "./src/constants";
import { PICKLE_ICON_ID, registerPickleIcon } from "./src/icons";
import { isPickleRequestFile } from "./src/requestDetection";
import { PickleResponseModal } from "./src/responseModal";
import { PickleSettingsTab } from "./src/settingsTab";
import type {
	PickleApprovalSettings,
	PickleRequestRecord,
	SmokeTestResult,
	ValidationSummary,
} from "./src/types";

export default class PicklePlugin extends Plugin {
	settings: PickleApprovalSettings = { ...DEFAULT_SETTINGS };
	service!: PickleCollectionService;

	override async onload(): Promise<void> {
		await this.loadSettings();
		registerPickleIcon();
		this.service = new PickleCollectionService(this.app, () => this.settings);

		this.addSettingTab(new PickleSettingsTab(this.app, this));
		this.registerPickleBasesView();
		this.registerCommands();

		try {
			await this.ensureCollection();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	async loadSettings(): Promise<void> {
		const loadedData = (await this.loadData()) as unknown;
		const loadedSettings =
			loadedData !== null && typeof loadedData === "object"
				? (loadedData as Partial<PickleApprovalSettings>)
				: {};
		this.settings = {
			...DEFAULT_SETTINGS,
			...loadedSettings,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async ensureCollection(): Promise<{ collectionPath: string; basePath: string }> {
		return await this.service.ensureCollection();
	}

	async validatePickleCollection(): Promise<ValidationSummary> {
		return await this.service.validateCollection();
	}

	async createSampleRequest(): Promise<PickleRequestRecord> {
		return await this.service.seedSampleRequest();
	}

	async runSmokeTest(): Promise<SmokeTestResult> {
		return await this.service.runSmokeTest();
	}

	async openResponseModalForPath(vaultPath: string): Promise<void> {
		const request = await this.service.readRequest(vaultPath);
		new PickleResponseModal(this.app, this.service, request).open();
	}

	private getActivePickleRequestFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!(file instanceof TFile)) return null;

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return isPickleRequestFile(file, frontmatter, this.service.collectionFolder) ? file : null;
	}

	private registerPickleBasesView(): void {
		try {
			this.registerBasesView(
				"pickleApprovalRequests",
				createBasesViewRegistration(this.service)
			);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: "ensure-collection",
			name: "Maintain collection",
			icon: PICKLE_ICON_ID,
			callback: () => {
				void this.ensureCollection().then((result) => {
					new Notice(`Maintained Pickle collection: ${result.collectionPath}`);
				});
			},
		});

		this.addCommand({
			id: "validate-collection",
			name: "Validate collection",
			icon: "shield-check",
			callback: () => {
				void this.validatePickleCollection().then((result) => {
					new Notice(
						result.valid
							? "Pickle collection validated"
							: `Pickle validation found ${result.issues.length} issues`
					);
				});
			},
		});

		this.addCommand({
			id: "open-request-base",
			name: "Open request base",
			icon: "table-2",
			callback: () => {
				void this.app.workspace.openLinkText(this.service.baseVaultPath, "", false);
			},
		});

		this.addCommand({
			id: "respond-current-request",
			name: "Respond to current request",
			icon: PICKLE_ICON_ID,
			checkCallback: (checking) => {
				const file = this.getActivePickleRequestFile();
				if (checking) return file !== null;
				if (!file) {
					new Notice("Active file is not a pickle request.");
					return false;
				}
				void this.openResponseModalForPath(file.path).catch((error) => {
					new Notice(error instanceof Error ? error.message : String(error));
				});
				return true;
			},
		});
	}
}
