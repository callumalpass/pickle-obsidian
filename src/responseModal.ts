import {
	ButtonComponent,
	Component,
	MarkdownRenderer,
	Modal,
	Notice,
	Setting,
	type App,
} from "obsidian";
import {
	coerceFieldValue,
	defaultFieldValue,
	fieldDescription,
	getEditableResponseFields,
	isRequiredField,
} from "./responseSchema";
import type {
	AttachmentDraft,
	FieldDefinition,
	PickleRequestRecord,
	PickleResponseRecord,
	TypeDefinition,
} from "./types";
import type { PickleCollectionService } from "./collectionService";

type RawValue = string | boolean;

interface ListState {
	ids: string[];
	nextId: number;
	itemsEl: HTMLElement;
	initialValues: Map<string, unknown>;
}

export class PickleResponseModal extends Modal {
	private readonly service: PickleCollectionService;
	private readonly request: PickleRequestRecord;
	private readonly rawValues = new Map<string, RawValue>();
	private readonly listStates = new Map<string, ListState>();
	private readonly touchedPaths = new Set<string>();
	private attachments: AttachmentDraft[] = [];
	private responseType: TypeDefinition | null = null;
	private existingResponse: PickleResponseRecord | null = null;
	private isSubmitting = false;
	private markdownComponent: Component | null = null;

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
			this.existingResponse = await this.service.findResponseForRequest(this.request.path);
			this.render();
		} catch (error) {
			this.renderError(error instanceof Error ? error.message : String(error));
		}
	}

	override onClose(): void {
		this.markdownComponent?.unload();
		this.markdownComponent = null;
		this.contentEl.empty();
	}

	private render(): void {
		if (!this.responseType) return;

		this.setTitle(this.existingResponse ? "Edit pickle response" : "Respond to pickle request");
		this.contentEl.empty();
		this.rawValues.clear();
		this.listStates.clear();
		this.touchedPaths.clear();
		this.contentEl.addClass("pickle-response-modal-content");

		const layout = this.contentEl.createDiv({ cls: "pickle-response-modal-layout" });
		const requestPane = layout.createDiv({
			cls: "pickle-response-modal-pane pickle-response-modal-request-pane",
		});
		this.renderRequestPane(requestPane);

		const responsePane = layout.createDiv({
			cls: "pickle-response-modal-pane pickle-response-modal-response-pane",
		});
		const responseHeader = responsePane.createDiv({
			cls: "pickle-response-modal-section-header",
		});
		responseHeader.createDiv({
			cls: "pickle-response-modal-section-title",
			text: "Response",
		});
		const description = this.stringValue(this.responseType.description, "");
		responseHeader.createDiv({
			cls: "pickle-response-modal-section-description",
			text:
				description.length > 0
					? description
					: "Create the durable response that downstream automation will read.",
		});

		const fieldsEl = responsePane.createDiv({
			cls: "pickle-response-modal-fields",
		});
		for (const field of getEditableResponseFields(this.responseType)) {
			this.renderField(fieldsEl, field.name, field.definition, field.name, 0);
		}

		this.renderAttachments(responsePane);

		const footer = this.contentEl.createDiv({ cls: "pickle-response-modal-footer" });
		const actions = footer.createDiv({ cls: "pickle-response-modal-actions" });
		new ButtonComponent(actions)
			.setButtonText("Cancel")
			.setTooltip("Close without saving a response")
			.onClick(() => {
				if (!this.isSubmitting) this.close();
			});
		new ButtonComponent(actions)
			.setButtonText(this.existingResponse ? "Update response" : "Create response")
			.setCta()
			.setTooltip(this.existingResponse ? "Update response file" : "Create response file")
			.onClick(() => {
				void this.submit();
			});
	}

	private renderRequestPane(parent: HTMLElement): void {
		const title = this.stringValue(this.request.frontmatter.title, this.request.path);
		const header = parent.createDiv({
			cls: "pickle-response-modal-request",
		});
		const eyebrow = header.createDiv({
			cls: "pickle-response-modal-eyebrow",
			text: this.stringValue(this.request.frontmatter.source, "unknown source"),
		});
		eyebrow.createSpan({
			cls: "pickle-response-modal-separator",
			text: " / ",
		});
		eyebrow.createSpan({
			cls: "pickle-response-modal-path",
			text: this.request.path,
		});
		header.createEl("h3", {
			cls: "pickle-response-modal-request-title",
			text: title,
		});

		const contextItems = [
			this.metaPair("Kind", this.request.frontmatter.kind),
			this.metaPair("Priority", this.request.frontmatter.priority),
			this.metaPair("State", this.request.derivedStatus),
			this.metaPair("Response type", this.request.frontmatter.response_type),
		].filter((item) => item.length > 0);

		if (contextItems.length > 0) {
			header.createDiv({
				cls: "pickle-response-modal-context",
				text: contextItems.join(" / "),
			});
		}

		this.renderStructuredContext(parent);

		const body =
			this.stringValue(this.request.body, "") ||
			this.stringValue(this.request.frontmatter.message, "");
		if (body.length > 0) {
			const details = parent.createEl("details", {
				cls: "pickle-response-modal-context-details",
			});
			details.open = true;
			const summary = details.createEl("summary", {
				cls: "pickle-response-modal-context-summary",
				text: "Request body",
			});
			summary.createSpan({
				cls: "pickle-response-modal-context-count",
				text: `${body.length.toLocaleString()} chars`,
			});
			const bodyEl = details.createDiv({
				cls: "pickle-response-modal-body-markdown markdown-rendered",
			});
			this.markdownComponent?.unload();
			this.markdownComponent = new Component();
			this.markdownComponent.load();
			void MarkdownRenderer.render(
				this.app,
				body,
				bodyEl,
				this.request.vaultPath,
				this.markdownComponent
			);
		}

		const actions = parent.createDiv({ cls: "pickle-response-modal-request-actions" });
		new ButtonComponent(actions)
			.setIcon("file-text")
			.setButtonText("Open request file")
			.setTooltip("Open the request note")
			.onClick(() => {
				void this.app.workspace.openLinkText(
					this.request.vaultPath,
					this.service.baseVaultPath,
					false
				);
				this.close();
			});
	}

	private renderField(
		parent: HTMLElement,
		name: string,
		definition: FieldDefinition,
		path: string,
		depth: number,
		initialValue?: unknown
	): void {
		if (definition.type === "object" && definition.fields) {
			this.renderObjectField(parent, name, definition, path, depth, initialValue);
			return;
		}

		if (definition.type === "list" && definition.items) {
			this.renderListField(parent, name, definition, path, depth, initialValue);
			return;
		}

		this.renderScalarField(parent, name, definition, path, depth, initialValue);
	}

	private renderScalarField(
		parent: HTMLElement,
		name: string,
		definition: FieldDefinition,
		path: string,
		depth: number,
		initialValue?: unknown
	): void {
		const description = fieldDescription(name, definition);
		const setting = new Setting(parent)
			.setName(this.fieldLabel(name, definition))
			.setClass("pickle-response-modal-field");
		setting.settingEl.addClass(`pickle-response-modal-field-${this.classToken(definition.type)}`);
		setting.settingEl.addClass(`pickle-response-modal-field-name-${this.classToken(name)}`);
		setting.settingEl.addClass(`pickle-response-modal-field-depth-${depth}`);
		if (this.usesTextarea(definition, name)) {
			setting.settingEl.addClass("pickle-response-modal-field-textarea");
		}
		if (description.length > 0) {
			setting.setDesc(description);
		}
		if (isRequiredField(definition)) {
			setting.settingEl.addClass("is-required");
		}

		const initialRawValue = this.initialFieldValue(path, definition, initialValue);
		if (!this.rawValues.has(path)) {
			this.rawValues.set(path, initialRawValue);
		}
		const rawValue = this.rawValues.get(path) ?? initialRawValue;

		if (definition.type === "boolean") {
			setting.addToggle((toggle) => {
				toggle.setValue(Boolean(rawValue)).onChange((value) => {
					this.setRawValue(path, value);
				});
			});
			return;
		}

		if (definition.type === "enum" && definition.values && definition.values.length > 0) {
			setting.addDropdown((dropdown) => {
				for (const value of definition.values ?? []) {
					dropdown.addOption(value, value);
				}
				dropdown.setValue(String(rawValue)).onChange((value) => {
					this.setRawValue(path, value);
				});
			});
			return;
		}

		if (this.usesTextarea(definition, name)) {
			setting.addTextArea((text) => {
				text.setValue(String(rawValue)).onChange((value) => {
					this.setRawValue(path, value);
				});
			});
			return;
		}

		setting.addText((text) => {
			text.setValue(String(rawValue)).onChange((value) => {
				this.setRawValue(path, value);
			});
		});
	}

	private renderObjectField(
		parent: HTMLElement,
		name: string,
		definition: FieldDefinition,
		path: string,
		depth: number,
		initialValue?: unknown
	): void {
		const block = this.createNestedFieldBlock(parent, name, definition, "object", depth);
		const nestedFields = block.createDiv({ cls: "pickle-response-modal-nested-fields" });
		const objectValue = this.structuredInitialValue(path, definition, initialValue);
		const objectRecord =
			objectValue && typeof objectValue === "object" && !Array.isArray(objectValue)
				? (objectValue as Record<string, unknown>)
				: {};

		for (const [childName, childDefinition] of Object.entries(definition.fields ?? {})) {
			this.renderField(
				nestedFields,
				childName,
				childDefinition,
				`${path}.${childName}`,
				depth + 1,
				objectRecord[childName]
			);
		}
	}

	private renderListField(
		parent: HTMLElement,
		name: string,
		definition: FieldDefinition,
		path: string,
		depth: number,
		initialValue?: unknown
	): void {
		const block = this.createNestedFieldBlock(parent, name, definition, "list", depth);
		const itemsEl = block.createDiv({ cls: "pickle-response-modal-list-items" });
		this.ensureListState(path, definition, itemsEl, initialValue);
		this.renderListItems(path, name, definition, depth);

		const actions = block.createDiv({ cls: "pickle-response-modal-list-actions" });
		new ButtonComponent(actions)
			.setIcon("plus")
			.setButtonText(`Add ${this.itemLabel(name)}`)
			.setTooltip(`Add another ${name} item`)
			.onClick(() => {
				this.addListItem(path, name, definition, depth);
			});
	}

	private createNestedFieldBlock(
		parent: HTMLElement,
		name: string,
		definition: FieldDefinition,
		type: "object" | "list",
		depth: number
	): HTMLElement {
		const block = parent.createDiv({
			cls: [
				"pickle-response-modal-field",
				"pickle-response-modal-nested-field",
				`pickle-response-modal-field-${this.classToken(type)}`,
				`pickle-response-modal-field-name-${this.classToken(name)}`,
				`pickle-response-modal-field-depth-${depth}`,
			].join(" "),
		});
		if (isRequiredField(definition)) {
			block.addClass("is-required");
		}

		const header = block.createDiv({ cls: "pickle-response-modal-nested-header" });
		header.createDiv({
			cls: "pickle-response-modal-field-title",
			text: this.fieldLabel(name, definition),
		});
		const description = this.nestedFieldDescription(name, definition, type);
		if (description.length > 0) {
			header.createDiv({
				cls: "pickle-response-modal-field-description",
				text: description,
			});
		}

		return block;
	}

	private ensureListState(
		path: string,
		definition: FieldDefinition,
		itemsEl: HTMLElement,
		initialValue?: unknown
	): ListState {
		const existingState = this.listStates.get(path);
		if (existingState) {
			existingState.itemsEl = itemsEl;
			return existingState;
		}

		const listValue = this.structuredInitialValue(path, definition, initialValue);
		const initialItems = Array.isArray(listValue) ? listValue : [];
		const minimumItems = Math.max(
			0,
			definition.min_items ?? 0,
			isRequiredField(definition) ? 1 : 0
		);
		const itemCount = Math.max(initialItems.length, minimumItems);
		const state: ListState = {
			ids: [],
			nextId: 0,
			itemsEl,
			initialValues: new Map<string, unknown>(),
		};

		for (let index = 0; index < itemCount; index += 1) {
			const id = this.nextListItemId(state);
			state.ids.push(id);
			state.initialValues.set(id, initialItems[index]);
		}

		this.listStates.set(path, state);
		return state;
	}

	private renderListItems(
		path: string,
		name: string,
		definition: FieldDefinition,
		depth: number
	): void {
		const state = this.listStates.get(path);
		if (!state || !definition.items) return;

		state.itemsEl.empty();
		const minimumItems = Math.max(0, definition.min_items ?? 0);
		for (const [index, id] of state.ids.entries()) {
			const itemPath = `${path}.${id}`;
			const item = state.itemsEl.createDiv({ cls: "pickle-response-modal-list-item" });
			const itemHeader = item.createDiv({ cls: "pickle-response-modal-list-item-header" });
			itemHeader.createDiv({
				cls: "pickle-response-modal-list-item-title",
				text: `${this.itemLabel(name)} ${index + 1}`,
			});
			const canRemove = state.ids.length > minimumItems;
			if (canRemove) {
				const removeButton = new ButtonComponent(itemHeader)
					.setIcon("trash-2")
					.setTooltip(`Remove ${this.itemLabel(name)} ${index + 1}`)
					.onClick(() => {
						this.removeListItem(path, id, name, definition, depth);
					});
				removeButton.buttonEl.setAttr(
					"aria-label",
					`Remove ${this.itemLabel(name)} ${index + 1}`
				);
			}
			this.renderField(
				item,
				this.itemLabel(name),
				definition.items,
				itemPath,
				depth + 1,
				state.initialValues.get(id)
			);
		}
	}

	private addListItem(
		path: string,
		name: string,
		definition: FieldDefinition,
		depth: number
	): void {
		const state = this.listStates.get(path);
		if (!state) return;

		const id = this.nextListItemId(state);
		state.ids.push(id);
		state.initialValues.set(id, undefined);
		this.touchedPaths.add(path);
		this.renderListItems(path, name, definition, depth);
	}

	private removeListItem(
		path: string,
		id: string,
		name: string,
		definition: FieldDefinition,
		depth: number
	): void {
		const state = this.listStates.get(path);
		if (!state) return;

		state.ids = state.ids.filter((itemId) => itemId !== id);
		state.initialValues.delete(id);
		this.deletePathValues(`${path}.${id}`);
		this.touchedPaths.add(path);
		this.renderListItems(path, name, definition, depth);
	}

	private renderAttachments(parent: HTMLElement): void {
		const attachmentBlock = parent.createDiv({ cls: "pickle-response-modal-attachments" });
		const header = attachmentBlock.createDiv({ cls: "pickle-response-modal-field-header" });
		header.createDiv({ cls: "pickle-response-modal-field-title", text: "Attachments" });
		header.createDiv({
			cls: "pickle-response-modal-field-description",
			text: "Files are copied into the pickle collection attachments folder.",
		});
		const input = attachmentBlock.createEl("input", {
			type: "file",
			attr: {
				multiple: true,
			},
		});
		const listEl = attachmentBlock.createDiv({
			cls: "pickle-response-modal-attachment-list",
			text: "No attachments selected.",
		});

		input.addEventListener("change", () => {
			void this.readAttachments(input.files).then(() => {
				this.renderAttachmentList(listEl);
			});
		});
	}

	private renderAttachmentList(parent: HTMLElement): void {
		parent.empty();
		if (this.attachments.length === 0) {
			parent.setText("No attachments selected.");
			return;
		}

		for (const attachment of this.attachments) {
			parent.createDiv({
				cls: "pickle-response-modal-attachment",
				text: attachment.name,
			});
		}
	}

	private renderStructuredContext(parent: HTMLElement): void {
		const context = this.request.frontmatter.context;
		if (!context || typeof context !== "object" || Array.isArray(context)) return;

		const entries = Object.entries(context as Record<string, unknown>).flatMap(([key, value]) => {
			const renderedValue = this.contextValue(value);
			return renderedValue.trim().length > 0 ? [{ key, value: renderedValue }] : [];
		});
		if (entries.length === 0) return;

		const details = parent.createEl("details", {
			cls: "pickle-response-modal-context-details",
		});
		details.open = true;
		details.createEl("summary", {
			cls: "pickle-response-modal-context-summary",
			text: "Structured context",
		});
		const list = details.createDiv({ cls: "pickle-response-modal-context-list" });
		for (const { key, value } of entries) {
			const item = list.createDiv({ cls: "pickle-response-modal-context-item" });
			item.createDiv({ cls: "pickle-response-modal-context-key", text: key });
			item.createDiv({
				cls: "pickle-response-modal-context-value",
				text: value,
			});
		}
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
		if (this.isSubmitting) return;

		try {
			this.isSubmitting = true;
			const values = this.collectValues(this.responseType);
			const response = this.existingResponse
				? await this.service.updateResponse({
						responsePath: this.existingResponse.path,
						requestPath: this.request.path,
						responseType: this.responseType.name,
						values,
						attachments: this.attachments,
					})
				: await this.service.createResponse({
						requestPath: this.request.path,
						responseType: this.responseType.name,
						values,
						attachments: this.attachments,
					});
			new Notice(
				`${this.existingResponse ? "Updated" : "Created"} Pickle response: ${response.vaultPath}`
			);
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		} finally {
			this.isSubmitting = false;
		}
	}

	private collectValues(typeDefinition: TypeDefinition): Record<string, unknown> {
		const values: Record<string, unknown> = {};

		for (const field of getEditableResponseFields(typeDefinition)) {
			const value = this.collectFieldValue(field.definition, field.name, field.name);
			if (value !== undefined) values[field.name] = value;
		}

		return values;
	}

	private collectFieldValue(
		definition: FieldDefinition,
		path: string,
		label: string
	): unknown {
		if (definition.type === "object" && definition.fields) {
			return this.collectObjectValue(definition, path, label);
		}

		if (definition.type === "list" && definition.items) {
			return this.collectListValue(definition, path, label);
		}

		const rawValue = this.rawValues.get(path) ?? "";
		const value = coerceFieldValue(definition, rawValue);

		if (value === undefined) {
			if (isRequiredField(definition)) {
				throw new Error(`${label} is required.`);
			}
			return undefined;
		}

		if (typeof value === "number" && Number.isNaN(value)) {
			throw new Error(`${label} must be a valid number.`);
		}

		return value;
	}

	private collectObjectValue(
		definition: FieldDefinition,
		path: string,
		label: string
	): unknown {
		if (!isRequiredField(definition) && !this.fieldHasAnyInput(definition, path)) {
			return undefined;
		}

		const values: Record<string, unknown> = {};
		for (const [childName, childDefinition] of Object.entries(definition.fields ?? {})) {
			const value = this.collectFieldValue(
				childDefinition,
				`${path}.${childName}`,
				`${label}.${childName}`
			);
			if (value !== undefined) values[childName] = value;
		}

		if (Object.keys(values).length === 0 && !isRequiredField(definition)) {
			return undefined;
		}

		return values;
	}

	private collectListValue(
		definition: FieldDefinition,
		path: string,
		label: string
	): unknown {
		const state = this.listStates.get(path);
		if (!state || !definition.items) {
			if (isRequiredField(definition)) throw new Error(`${label} is required.`);
			return undefined;
		}

		if (!isRequiredField(definition) && !this.fieldHasAnyInput(definition, path)) {
			return undefined;
		}

		const values: unknown[] = [];
		for (const [index, id] of state.ids.entries()) {
			const value = this.collectFieldValue(
				definition.items,
				`${path}.${id}`,
				`${label}[${index + 1}]`
			);
			if (value !== undefined) values.push(value);
		}

		if (values.length === 0) {
			if (isRequiredField(definition)) throw new Error(`${label} is required.`);
			return undefined;
		}

		if (definition.min_items !== undefined && values.length < definition.min_items) {
			throw new Error(`${label} needs at least ${definition.min_items} items.`);
		}

		if (definition.max_items !== undefined && values.length > definition.max_items) {
			throw new Error(`${label} can include at most ${definition.max_items} items.`);
		}

		return values;
	}

	private initialFieldValue(
		path: string,
		definition: FieldDefinition,
		initialValue?: unknown
	): RawValue {
		const existingValue = this.structuredInitialValue(path, definition, initialValue);
		if (existingValue === undefined) {
			return defaultFieldValue(definition);
		}

		if (definition.type === "boolean") {
			return Boolean(existingValue);
		}

		if (Array.isArray(existingValue)) {
			return existingValue.map((item) => String(item)).join("\n");
		}

		if (existingValue !== null && typeof existingValue === "object") {
			return JSON.stringify(existingValue, null, 2);
		}

		if (
			typeof existingValue === "string" ||
			typeof existingValue === "number" ||
			typeof existingValue === "boolean"
		) {
			return String(existingValue);
		}

		return "";
	}

	private structuredInitialValue(
		path: string,
		definition: FieldDefinition,
		initialValue?: unknown
	): unknown {
		if (initialValue !== undefined) return initialValue;
		const existingValue = this.existingValueAtPath(path);
		if (existingValue !== undefined) return existingValue;
		const metadataValue = this.requestMetadataValueAtPath(path);
		if (metadataValue !== undefined) return metadataValue;
		return definition.default;
	}

	private requestMetadataValueAtPath(path: string): unknown {
		const segments = path.split(".");
		let value: unknown = this.request.frontmatter.metadata;
		if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

		for (const segment of segments) {
			if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
			value = (value as Record<string, unknown>)[segment];
			if (value === undefined) return undefined;
		}

		return value;
	}

	private existingValueAtPath(path: string): unknown {
		const segments = path.split(".");
		const [firstSegment, ...rest] = segments;
		if (!firstSegment) return undefined;

		let value: unknown = this.existingResponse?.frontmatter[firstSegment];
		for (const segment of rest) {
			if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
			value = (value as Record<string, unknown>)[segment];
		}
		return value;
	}

	private fieldHasAnyInput(definition: FieldDefinition, path: string): boolean {
		if (this.touchedPaths.has(path)) return true;
		if (
			this.existingValueAtPath(path) !== undefined ||
			this.requestMetadataValueAtPath(path) !== undefined ||
			definition.default !== undefined
		) {
			return true;
		}

		if (definition.type === "object" && definition.fields) {
			return Object.entries(definition.fields).some(([childName, childDefinition]) =>
				this.fieldHasAnyInput(childDefinition, `${path}.${childName}`)
			);
		}

		if (definition.type === "list" && definition.items) {
			const state = this.listStates.get(path);
			if (!state) return false;
			return state.ids.some((id) =>
				this.fieldHasAnyInput(definition.items as FieldDefinition, `${path}.${id}`)
			);
		}

		const rawValue = this.rawValues.get(path);
		if (rawValue === undefined) return false;
		if (typeof rawValue === "boolean") return rawValue;
		const text = rawValue.trim();
		if (text.length === 0) return false;
		if (
			definition.type === "enum" &&
			definition.values &&
			definition.values[0] === text &&
			!this.touchedPaths.has(path)
		) {
			return false;
		}
		return true;
	}

	private setRawValue(path: string, value: RawValue): void {
		this.rawValues.set(path, value);
		this.touchedPaths.add(path);
	}

	private deletePathValues(path: string): void {
		for (const key of Array.from(this.rawValues.keys())) {
			if (key === path || key.startsWith(`${path}.`)) {
				this.rawValues.delete(key);
				this.touchedPaths.delete(key);
			}
		}

		for (const key of Array.from(this.listStates.keys())) {
			if (key === path || key.startsWith(`${path}.`)) {
				this.listStates.delete(key);
			}
		}
	}

	private nextListItemId(state: ListState): string {
		const id = `item-${state.nextId}`;
		state.nextId += 1;
		return id;
	}

	private usesTextarea(definition: FieldDefinition, name: string): boolean {
		return (
			name.includes("comment") ||
			(definition.type === "object" && !definition.fields) ||
			(definition.type === "list" && !definition.items)
		);
	}

	private nestedFieldDescription(
		name: string,
		definition: FieldDefinition,
		type: "object" | "list"
	): string {
		const parts = [fieldDescription(name, definition)].filter((part) => part.length > 0);
		if (type === "list") {
			if (definition.min_items !== undefined) {
				parts.push(`At least ${definition.min_items} items.`);
			}
			if (definition.max_items !== undefined) {
				parts.push(`At most ${definition.max_items} items.`);
			}
		}
		return parts.join(" ");
	}

	private itemLabel(name: string): string {
		const label = name.replace(/_/gu, " ").replace(/\s+/gu, " ").trim();
		if (label.length === 0) return "item";
		return label.endsWith("s") ? label.slice(0, -1) : label;
	}

	private renderError(message: string): void {
		this.setTitle("Pickle response");
		this.contentEl.empty();
		const error = this.contentEl.createDiv({ cls: "pickle-response-modal-error" });
		error.createDiv({ cls: "pickle-response-modal-error-title", text: "Cannot respond" });
		error.createDiv({ cls: "pickle-response-modal-error-message", text: message });
	}

	private stringValue(value: unknown, fallback: string): string {
		return typeof value === "string" && value.trim().length > 0 ? value : fallback;
	}

	private metaPair(label: string, value: unknown): string {
		const text = this.stringValue(value, "");
		return text.length > 0 ? `${label}: ${text}` : "";
	}

	private contextValue(value: unknown): string {
		if (value === undefined || value === null) return "";
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean") return String(value);
		return JSON.stringify(value) ?? "";
	}

	private fieldLabel(name: string, definition: FieldDefinition): string {
		return isRequiredField(definition) ? `${name} *` : name;
	}

	private classToken(value: string): string {
		return value.toLowerCase().replace(/[^a-z0-9-]+/giu, "-").replace(/^-|-$/gu, "") || "unknown";
	}
}
