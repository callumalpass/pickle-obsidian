import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type PicklePlugin from "../main";

export class PickleSettingsTab extends PluginSettingTab {
	private readonly plugin: PicklePlugin;

	constructor(app: App, plugin: PicklePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Collection").setHeading();

		new Setting(containerEl)
			.setName("Collection folder")
			.setDesc("Vault folder that contains the mdbase pickle collection.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.collectionFolder)
					.onChange((value) => {
						this.plugin.settings.collectionFolder = value.trim() || "_pickle";
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Requests folder")
			.setDesc("Folder inside the collection for request files.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.requestsFolder)
					.onChange((value) => {
						this.plugin.settings.requestsFolder = value.trim() || "requests";
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Responses folder")
			.setDesc("Folder inside the collection for response files.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.responsesFolder)
					.onChange((value) => {
						this.plugin.settings.responsesFolder = value.trim() || "responses";
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Attachments folder")
			.setDesc("Folder inside the collection for copied response attachments.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.attachmentsFolder)
					.onChange((value) => {
						this.plugin.settings.attachmentsFolder = value.trim() || "attachments";
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Base file")
			.setDesc("Base file maintained inside the collection.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.baseFile)
					.onChange((value) => {
						this.plugin.settings.baseFile = value.trim() || "Pickle Requests.base";
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default responder")
			.setDesc("Value written to the responder field on response files.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.defaultResponder)
					.onChange((value) => {
						this.plugin.settings.defaultResponder = value.trim() || "human";
						void this.plugin.saveSettings();
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
						void this.plugin.ensureCollection().then((result) => {
							new Notice(`Maintained Pickle collection: ${result.collectionPath}`);
						});
					})
			);
	}
}
