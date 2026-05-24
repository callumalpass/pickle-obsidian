import {
	BasesView,
	ButtonComponent,
	type BasesEntry,
	type BasesPropertyId,
	type BasesViewRegistration,
	type QueryController,
	type Value,
} from "obsidian";
import { BASES_VIEW_TYPE, REQUEST_TYPE } from "./constants";
import type { PickleCollectionService } from "./collectionService";
import { PICKLE_ICON_ID } from "./icons";
import { collectionRelativePath } from "./path";
import { PickleResponseModal } from "./responseModal";
import type { FieldDefinition, PickleRequestRecord, TypeDefinition } from "./types";

const DEFAULT_PROPERTY_ORDER = [
	"note.title",
	"note.status",
	"note.priority",
	"note.source",
	"note.response_type",
	"note.created_at",
] satisfies BasesPropertyId[];

interface PickleRequestRow {
	entry: BasesEntry;
	record: PickleRequestRecord;
}

interface PropertyRenderModel {
	key: string;
	definition: FieldDefinition | null;
	isDisplayName: boolean;
}

export class PickleRequestsBasesView extends BasesView {
	override type = BASES_VIEW_TYPE;
	private readonly containerEl: HTMLElement;
	private readonly service: PickleCollectionService;
	private renderVersion = 0;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		service: PickleCollectionService
	) {
		super(controller);
		this.containerEl = containerEl;
		this.service = service;
	}

	override onload(): void {
		this.containerEl.addClass("pickle-approval-center-view");
		void this.renderAsync();
	}

	override onunload(): void {
		this.containerEl.empty();
	}

	override onDataUpdated(): void {
		void this.renderAsync();
	}

	private async renderAsync(): Promise<void> {
		const renderVersion = ++this.renderVersion;
		const entries = this.data?.data ?? [];
		const [rows, requestType] = await Promise.all([
			this.rowsForEntries(entries),
			this.readRequestTypeDefinition(),
		]);
		if (renderVersion !== this.renderVersion) return;

		const properties = this.visibleProperties();
		this.containerEl.empty();

		if (rows.length === 0) {
			const empty = this.containerEl.createDiv({
				cls: "pickle-approval-center-empty",
			});
			empty.createDiv({
				cls: "pickle-approval-center-empty-title",
				text: "No matching requests",
			});
			empty.createDiv({
				cls: "pickle-approval-center-empty-copy",
				text: "Change the Bases filters or maintain the Pickle collection to bring requests into this view.",
			});
			return;
		}

		const tableWrap = this.containerEl.createDiv({
			cls: "pickle-approval-center-table-wrap",
		});
		const table = tableWrap.createEl("table", {
			cls: "pickle-approval-center-table",
		});
		const header = table.createEl("thead").createEl("tr");
		for (const property of properties) {
			header.createEl("th", { text: this.config.getDisplayName(property) });
		}
		header.createEl("th", { text: "Action" });

		const body = table.createEl("tbody");
		for (const row of rows) {
			this.renderRow(body, row, properties, requestType);
		}
	}

	private async readRequestTypeDefinition(): Promise<TypeDefinition | null> {
		try {
			return await this.service.readTypeDefinition(REQUEST_TYPE);
		} catch {
			return null;
		}
	}

	private async rowsForEntries(entries: BasesEntry[]): Promise<PickleRequestRow[]> {
		const allRequests = await this.service.listRequests();
		const byVaultPath = new Map(allRequests.map((request) => [request.vaultPath, request]));
		const orderedRows: PickleRequestRow[] = [];

		for (const entry of entries) {
			const relativePath = collectionRelativePath(entry.file.path, this.service.collectionFolder);
			if (relativePath === null) continue;

			const record = byVaultPath.get(entry.file.path);
			if (record) {
				orderedRows.push({ entry, record });
			}
		}

		return orderedRows;
	}

	private renderRow(
		parent: HTMLElement,
		requestRow: PickleRequestRow,
		properties: BasesPropertyId[],
		requestType: TypeDefinition | null
	): void {
		const { record } = requestRow;
		const row = parent.createEl("tr");
		row.addClass("pickle-approval-center-row");
		row.addClass(this.isAnswered(record) ? "is-answered" : "is-pending");
		row.tabIndex = 0;
		row.addEventListener("click", (event) => {
			if (this.eventStartedInControl(event)) return;
			this.openResponseModal(record);
		});
		row.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			if (this.eventStartedInControl(event)) return;
			event.preventDefault();
			this.openResponseModal(record);
		});

		for (const property of properties) {
			this.renderPropertyCell(row, requestRow, property, requestType);
		}
		const actionCell = row.createEl("td", {
			cls: "pickle-approval-center-action-cell",
		});
		const isAnswered = this.isAnswered(record);
		const responseButton = new ButtonComponent(actionCell)
			.setIcon(isAnswered ? "file-check" : PICKLE_ICON_ID)
			.setTooltip(isAnswered ? "Edit response" : "Respond to request")
			.onClick(() => {
				this.openResponseModal(record);
			});
		responseButton.buttonEl.setAttr(
			"aria-label",
			isAnswered ? "Edit response" : "Respond to request"
		);
		responseButton.buttonEl.addClass("pickle-approval-center-action-button");
		if (!isAnswered) responseButton.buttonEl.addClass("mod-cta");
		responseButton.buttonEl.addEventListener("click", (event) => {
			event.stopPropagation();
		});
	}

	private visibleProperties(): BasesPropertyId[] {
		const order = this.config.getOrder();
		return order.length > 0 ? order : DEFAULT_PROPERTY_ORDER;
	}

	private renderPropertyCell(
		parent: HTMLElement,
		requestRow: PickleRequestRow,
		property: BasesPropertyId,
		requestType: TypeDefinition | null
	): void {
		const model = this.propertyRenderModel(property, requestType);
		const cell = parent.createEl("td", {
			cls: [
				"pickle-approval-center-cell",
				`pickle-approval-center-cell-${this.classToken(model.key)}`,
				`pickle-approval-center-cell-type-${this.classToken(model.definition?.type ?? "unknown")}`,
			].join(" "),
		});
		const value = requestRow.entry.getValue(property);
		const fallback = this.recordPropertyValue(requestRow.record, property);
		const text = this.valueText(value, fallback);

		if (model.isDisplayName) {
			this.renderTitleCell(cell, requestRow, text);
			return;
		}

		if (this.opensRequest(property)) {
			const button = cell.createEl("button", {
				cls: "pickle-approval-center-file-link",
				text,
				type: "button",
			});
			button.addEventListener("click", (event) => {
				event.stopPropagation();
				void this.openRecord(requestRow.record);
			});
			return;
		}

		this.renderTypedCell(cell, requestRow.record, model, text);
	}

	private renderTypedCell(
		parent: HTMLElement,
		record: PickleRequestRecord,
		model: PropertyRenderModel,
		text: string
	): void {
		const type = model.definition?.type ?? "string";
		const value = record.frontmatter[model.key];

		switch (type) {
			case "enum":
				this.renderPill(parent, this.enumText(record, model.key, text), model.key);
				return;
			case "datetime":
				parent.createSpan({
					cls: "pickle-approval-center-date",
					text: this.formatDate(text),
				});
				return;
			case "boolean":
				this.renderPill(parent, text || "false", model.key);
				return;
			case "integer":
			case "number":
				parent.createSpan({
					cls: "pickle-approval-center-number",
					text,
				});
				return;
			case "list":
				this.renderListValue(parent, value, text);
				return;
			case "object":
				this.renderObjectValue(parent, value, model.definition, text);
				return;
			default:
				parent.createSpan({
					cls: "pickle-approval-center-text-value",
					text,
				});
		}
	}

	private renderTitleCell(
		parent: HTMLElement,
		requestRow: PickleRequestRow,
		title: string
	): void {
		const titleStack = parent.createDiv({ cls: "pickle-approval-center-title-stack" });
		const button = titleStack.createEl("button", {
			cls: "pickle-approval-center-file-link pickle-approval-center-title-link",
			text: title || requestRow.record.path,
			type: "button",
		});
		button.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.openRecord(requestRow.record);
		});

		const details = [
			this.contextTask(requestRow.record),
			requestRow.record.responseCount > 0
				? `${requestRow.record.responseCount} response${
						requestRow.record.responseCount === 1 ? "" : "s"
					}`
				: "",
			requestRow.record.path,
		].filter((item) => item.length > 0);
		if (details.length > 0) {
			titleStack.createDiv({
				cls: "pickle-approval-center-title-meta",
				text: details.join(" / "),
			});
		}
	}

	private renderPill(parent: HTMLElement, value: string, fieldName: string): void {
		const normalized = value.trim().length > 0 ? value.trim() : "unknown";
		parent.createSpan({
			cls: [
				"pickle-approval-center-pill",
				`pickle-approval-center-pill-${this.classToken(fieldName)}`,
				`pickle-approval-center-pill-${this.classToken(fieldName)}-${this.classToken(normalized)}`,
			].join(" "),
			text: normalized,
		});
	}

	private renderListValue(parent: HTMLElement, value: unknown, fallback: string): void {
		const items = Array.isArray(value)
			? value.map((item) => String(item))
			: fallback
					.split(/\r?\n|,/u)
					.map((item) => item.trim())
					.filter((item) => item.length > 0);

		if (items.length === 0) {
			parent.createSpan({ cls: "pickle-approval-center-text-value is-empty", text: "None" });
			return;
		}

		const list = parent.createDiv({ cls: "pickle-approval-center-list-value" });
		for (const item of items.slice(0, 3)) {
			list.createSpan({ cls: "pickle-approval-center-list-item", text: item });
		}
		if (items.length > 3) {
			list.createSpan({
				cls: "pickle-approval-center-list-more",
				text: `+${items.length - 3}`,
			});
		}
	}

	private renderObjectValue(
		parent: HTMLElement,
		value: unknown,
		definition: FieldDefinition | null,
		fallback: string
	): void {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			parent.createSpan({ cls: "pickle-approval-center-text-value", text: fallback });
			return;
		}

		const objectValue = value as Record<string, unknown>;
		const preferredKeys = Object.keys(definition?.fields ?? {});
		const keys = preferredKeys.length > 0 ? preferredKeys : Object.keys(objectValue);
		const firstKey = keys.find((key) => objectValue[key] !== undefined);
		if (!firstKey) {
			parent.createSpan({ cls: "pickle-approval-center-text-value is-empty", text: "Empty" });
			return;
		}

		const visibleKeys = Object.keys(objectValue).filter((key) => objectValue[key] !== undefined);
		const preview = parent.createSpan({ cls: "pickle-approval-center-object-value" });
		preview.createSpan({
			cls: "pickle-approval-center-object-key",
			text: `${firstKey}: `,
		});
		preview.createSpan({
			cls: "pickle-approval-center-object-preview",
			text: String(objectValue[firstKey]),
		});
		if (visibleKeys.length > 1) {
			preview.createSpan({
				cls: "pickle-approval-center-object-more",
				text: ` +${visibleKeys.length - 1}`,
			});
		}
	}

	private async openRecord(record: PickleRequestRecord): Promise<void> {
		await this.app.workspace.openLinkText(record.vaultPath, this.service.baseVaultPath, false);
	}

	private openResponseModal(record: PickleRequestRecord): void {
		new PickleResponseModal(this.app, this.service, record).open();
	}

	private valueText(value: Value | null, fallback: string): string {
		const rendered = value?.toString().trim() ?? "";
		return rendered.length > 0 ? rendered : fallback;
	}

	private recordPropertyValue(record: PickleRequestRecord, property: BasesPropertyId): string {
		if (property === "file.name") {
			return record.vaultPath.split("/").pop()?.replace(/\.md$/iu, "") ?? record.path;
		}

		const key = property.includes(".") ? property.split(".").slice(1).join(".") : property;
		const value = record.frontmatter[key];
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean") return String(value);
		if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
		if (value && typeof value === "object") return JSON.stringify(value);
		return "";
	}

	private opensRequest(property: BasesPropertyId): boolean {
		return property === "file.name" || property.endsWith(".title");
	}

	private propertyKey(property: BasesPropertyId): string {
		if (property.startsWith("file.")) return property;
		if (!property.includes(".")) return property;
		return property.split(".").slice(1).join(".");
	}

	private propertyRenderModel(
		property: BasesPropertyId,
		requestType: TypeDefinition | null
	): PropertyRenderModel {
		const key = this.propertyKey(property);
		return {
			key,
			definition: requestType?.fields?.[key] ?? null,
			isDisplayName: key === (requestType?.display_name_key ?? "title"),
		};
	}

	private isAnswered(record: PickleRequestRecord): boolean {
		return record.answered || this.stringValue(record.frontmatter.status).toLowerCase() === "answered";
	}

	private statusFor(record: PickleRequestRecord, fallback: string): string {
		if (this.isAnswered(record)) return "answered";
		return fallback.trim().length > 0 ? fallback : "pending";
	}

	private enumText(record: PickleRequestRecord, key: string, fallback: string): string {
		if (key === "status") return this.statusFor(record, fallback);
		return fallback.trim().length > 0 ? fallback : "unknown";
	}

	private contextTask(record: PickleRequestRecord): string {
		const context = record.frontmatter.context;
		if (!context || typeof context !== "object") return "";
		const task = (context as Record<string, unknown>).task;
		return typeof task === "string" ? task : "";
	}

	private formatDate(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	}

	private stringValue(value: unknown): string {
		return typeof value === "string" ? value : "";
	}

	private classToken(value: string): string {
		return value.toLowerCase().replace(/[^a-z0-9-]+/giu, "-").replace(/^-|-$/gu, "") || "unknown";
	}

	private eventStartedInControl(event: Event): boolean {
		return event.target instanceof HTMLElement && Boolean(event.target.closest("button, a"));
	}
}

export function createBasesViewRegistration(
	service: PickleCollectionService
): BasesViewRegistration {
	return {
		name: "Pickle requests",
		icon: PICKLE_ICON_ID,
		factory: (controller, containerEl) =>
			new PickleRequestsBasesView(controller, containerEl, service),
	};
}
