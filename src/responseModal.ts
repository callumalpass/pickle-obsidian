import { Modal, Notice, Setting, type App } from "obsidian";
import { coerceFieldValue, defaultFieldValue, fieldDescription, getEditableResponseFields, isRequiredField } from "./responseSchema";
import type { AttachmentDraft, FieldDefinition, PickleRequestRecord, TypeDefinition } from "./types";
import type { PickleCollectionService } from "./collectionService";

type RawValue = string | boolean;

export class PickleResponseModal extends Modal {
	private readonly service: PickleCollectionService;
	private readonly request: PickleRequestRecord;
	private readonly rawValues = new Map<string, RawValue>();
	private attachments: AttachmentDraft[] = [];
	private responseType: TypeDefinition | null = null;

	constructor(app: App, service: PickleCollectionService, request: PickleRequestRecord) {
		super(app);
		this.service = service;
		this.request = request;
	}

	override async onOpen(): Promise<void> {
		this.modalEl.addClass("pickle-response-modal");
		const responseTypeName = this.request.frontmatter.response_type;
		if (typeof responseTypeName !== "string" || responseTypeName.trim().length === 0) {
			this.renderError("Request is missing a response type.");
			return;
		}

		try {
			this.responseType = await this.service.readTypeDefinition(responseTypeName);
			this.render();
		} catch (error) {
			this.renderError(error instanceof Error ? error.message : String(error));
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		if (!this.responseType) return;

		this.setTitle("Respond to pickle request");
		this.contentEl.empty();

		const title = this.stringValue(this.request.frontmatter.title, this.request.path);
		this.contentEl.createEl("h3", { text: title });
		const meta = this.contentEl.createDiv({ cls: "pickle-approval-center-meta" });
		meta.setText(
			`${this.stringValue(this.request.frontmatter.source, "unknown source")} · ${this.request.path}`
		);

		for (const field of getEditableResponseFields(this.responseType)) {
			this.renderField(field.name, field.definition);
		}

		this.renderAttachments();

		new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText("Cancel")
					.setTooltip("Close without creating a response")
					.onClick(() => this.close());
			})
			.addButton((button) => {
				button
					.setButtonText("Create response")
					.setCta()
					.setTooltip("Create response file")
					.onClick(() => {
						void this.submit();
					});
			});
	}

	private renderField(name: string, definition: FieldDefinition): void {
		const description = fieldDescription(name, definition);
		const setting = new Setting(this.contentEl).setName(name);
		if (description.length > 0) {
			setting.setDesc(description);
		}

		const initialValue = defaultFieldValue(definition);
		this.rawValues.set(name, initialValue);

		if (definition.type === "boolean") {
			setting.addToggle((toggle) => {
				toggle.setValue(Boolean(initialValue)).onChange((value) => {
					this.rawValues.set(name, value);
				});
			});
			return;
		}

		if (definition.type === "enum" && definition.values && definition.values.length > 0) {
			setting.addDropdown((dropdown) => {
				for (const value of definition.values ?? []) {
					dropdown.addOption(value, value);
				}
				dropdown.setValue(String(initialValue)).onChange((value) => {
					this.rawValues.set(name, value);
				});
			});
			return;
		}

		if (definition.type === "list" || definition.type === "object" || name === "comment") {
			setting.addTextArea((text) => {
				text.setValue(String(initialValue)).onChange((value) => {
					this.rawValues.set(name, value);
				});
			});
			return;
		}

		setting.addText((text) => {
			text.setValue(String(initialValue)).onChange((value) => {
				this.rawValues.set(name, value);
			});
		});
	}

	private renderAttachments(): void {
		const setting = new Setting(this.contentEl)
			.setName("Attachments")
			.setDesc("Files are copied into the pickle collection attachments folder.");
		const input = setting.controlEl.createEl("input", {
			type: "file",
			attr: {
				multiple: true,
			},
		});

		input.addEventListener("change", () => {
			void this.readAttachments(input.files);
		});
	}

	private async readAttachments(fileList: FileList | null): Promise<void> {
		const files = Array.from(fileList ?? []);
		this.attachments = await Promise.all(
			files.map(async (file) => ({
				name: file.name,
				data: await file.arrayBuffer(),
			}))
		);
	}

	private async submit(): Promise<void> {
		if (!this.responseType) return;

		try {
			const values = this.collectValues(this.responseType);
			const response = await this.service.createResponse({
				requestPath: this.request.path,
				responseType: this.responseType.name,
				values,
				attachments: this.attachments,
			});
			new Notice(`Created Pickle response: ${response.vaultPath}`);
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	private collectValues(typeDefinition: TypeDefinition): Record<string, unknown> {
		const values: Record<string, unknown> = {};

		for (const field of getEditableResponseFields(typeDefinition)) {
			const rawValue = this.rawValues.get(field.name) ?? "";
			const value = coerceFieldValue(field.definition, rawValue);

			if (value === undefined) {
				if (isRequiredField(field.definition)) {
					throw new Error(`${field.name} is required.`);
				}
				continue;
			}

			values[field.name] = value;
		}

		return values;
	}

	private renderError(message: string): void {
		this.setTitle("Pickle response");
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: message });
	}

	private stringValue(value: unknown, fallback: string): string {
		return typeof value === "string" && value.trim().length > 0 ? value : fallback;
	}
}
