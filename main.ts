import { Notice, Plugin, TFile } from "obsidian";
import { createBasesViewRegistration } from "./src/basesView";
import { PickleCollectionService } from "./src/collectionService";
import { DEFAULT_SETTINGS } from "./src/constants";
import { PickleResponseModal } from "./src/responseModal";
import { PickleApprovalSettingsTab } from "./src/settingsTab";
import type {
	PickleApprovalSettings,
	PickleRequestRecord,
	SmokeTestResult,
	ValidationSummary,
} from "./src/types";

export default class PickleApprovalCenterPlugin extends Plugin {
	settings: PickleApprovalSettings = { ...DEFAULT_SETTINGS };
	service!: PickleCollectionService;

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.service = new PickleCollectionService(this.app, () => this.settings);

		this.addSettingTab(new PickleApprovalSettingsTab(this.app, this));
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
			name: "Maintain pickle collection",
			callback: () => {
				void this.ensureCollection().then((result) => {
					new Notice(`Maintained Pickle collection: ${result.collectionPath}`);
				});
			},
		});

		this.addCommand({
			id: "validate-collection",
			name: "Validate pickle collection",
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
			name: "Open pickle request base",
			callback: () => {
				void this.app.workspace.openLinkText(this.service.baseVaultPath, "", false);
			},
		});

		this.addCommand({
			id: "respond-current-request",
			name: "Respond to current pickle request",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				const canRun = file instanceof TFile;
				if (checking) return canRun;
				if (!file) {
					new Notice("No active request file.");
					return false;
				}
				void this.openResponseModalForPath(file.path);
				return true;
			},
		});

		this.addCommand({
			id: "seed-sample-request",
			name: "Seed sample pickle request",
			callback: () => {
				void this.createSampleRequest().then((request) => {
					new Notice(`Created sample Pickle request: ${request.vaultPath}`);
				});
			},
		});

		this.addCommand({
			id: "run-smoke-test",
			name: "Run approval center smoke test",
			callback: () => {
				void this.runSmokeTest().then((result) => {
					new Notice(
						result.valid
							? `Pickle smoke test passed: ${result.responsePath}`
							: `Pickle smoke test created files but validation found ${result.issues.length} issues`
					);
				});
			},
		});
	}
}
