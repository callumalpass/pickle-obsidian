import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type PicklePlugin from "../main";

export class PickleSettingsTab extends PluginSettingTab {
	private readonly picklePlugin: PicklePlugin;

	constructor(app: App, plugin: PicklePlugin) {
		super(app, plugin);
		this.picklePlugin = plugin;
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Collection").setHeading();

		new Setting(containerEl)
			.setName("Collection folder")
			.setDesc("Vault folder that contains request and response files.")
			.addText((text) =>
				text
					.setValue(this.picklePlugin.settings.collectionFolder)
					.onChange((value) => {
						this.picklePlugin.settings.collectionFolder = value.trim() || "_pickle";
						void this.picklePlugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Requests folder")
			.setDesc("Folder inside the collection for request files.")
			.addText((text) =>
				text
					.setValue(this.picklePlugin.settings.requestsFolder)
					.onChange((value) => {
						this.picklePlugin.settings.requestsFolder = value.trim() || "requests";
						void this.picklePlugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Responses folder")
			.setDesc("Folder inside the collection for response files.")
			.addText((text) =>
				text
					.setValue(this.picklePlugin.settings.responsesFolder)
					.onChange((value) => {
						this.picklePlugin.settings.responsesFolder = value.trim() || "responses";
						void this.picklePlugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Attachments folder")
			.setDesc("Folder inside the collection for copied response attachments.")
			.addText((text) =>
				text
					.setValue(this.picklePlugin.settings.attachmentsFolder)
					.onChange((value) => {
						this.picklePlugin.settings.attachmentsFolder = value.trim() || "attachments";
						void this.picklePlugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Base file")
			.setDesc("Base file maintained inside the collection.")
			.addText((text) =>
				text
					.setValue(this.picklePlugin.settings.baseFile)
					.onChange((value) => {
						this.picklePlugin.settings.baseFile = value.trim() || "Pickle Requests.base";
						void this.picklePlugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default responder")
			.setDesc("Value written to the responder field on response files.")
			.addText((text) =>
				text
					.setValue(this.picklePlugin.settings.defaultResponder)
					.onChange((value) => {
						this.picklePlugin.settings.defaultResponder = value.trim() || "human";
						void this.picklePlugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Maintain files")
			.setDesc("Create the collection folders, default types, and request base file.")
			.addButton((button) =>
				button
					.setButtonText("Maintain")
					.setCta()
					.onClick(() => {
						void this.picklePlugin.ensureCollection().then((result) => {
							new Notice(`Maintained Pickle collection: ${result.collectionPath}`);
						});
					})
			);
	}
}
