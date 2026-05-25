import {
	BasesView,
	ButtonComponent,
	type BasesAllOptions,
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
import type { PickleRequestState } from "./requestState";
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

type PickleRequestViewState = PickleRequestState | "all";

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
		this.containerEl.addClass("pickle-view");
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
				cls: "pickle-empty",
			});
			empty.createDiv({
				cls: "pickle-empty-title",
				text: "No matching requests",
			});
			empty.createDiv({
				cls: "pickle-empty-copy",
				text: "Change the Bases filters or maintain the Pickle collection to bring requests into this view.",
			});
			return;
		}

		this.renderMobileList(rows, properties, requestType);

		const tableWrap = this.containerEl.createDiv({
			cls: "pickle-table-wrap",
		});
		const table = tableWrap.createEl("table", {
			cls: "pickle-table",
		});
		const header = table.createEl("thead").createEl("tr");
		for (const property of properties) {
			header.createEl("th", { text: this.displayName(property) });
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
		const selectedState = this.selectedRequestState();

		for (const entry of entries) {
			const relativePath = collectionRelativePath(entry.file.path, this.service.collectionFolder);
			if (relativePath === null) continue;

			const record = byVaultPath.get(entry.file.path);
			if (record && this.matchesSelectedState(record, selectedState)) {
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
		row.addClass("pickle-row");
		row.addClass(`is-${record.derivedStatus}`);
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
			cls: "pickle-action-cell",
		});
		actionCell.setAttr("data-label", "Action");
		this.renderActionButton(actionCell, record);
	}

	private renderMobileList(
		rows: PickleRequestRow[],
		properties: BasesPropertyId[],
		requestType: TypeDefinition | null
	): void {
		const list = this.containerEl.createDiv({ cls: "pickle-mobile-list" });
		for (const row of rows) {
			this.renderMobileCard(list, row, properties, requestType);
		}
	}

	private renderMobileCard(
		parent: HTMLElement,
		requestRow: PickleRequestRow,
		properties: BasesPropertyId[],
		requestType: TypeDefinition | null
	): void {
		const { record } = requestRow;
		const card = parent.createDiv({
			cls: [
				"pickle-mobile-card",
				`is-${record.derivedStatus}`,
			].join(" "),
		});
		card.tabIndex = 0;
		card.addEventListener("click", (event) => {
			if (this.eventStartedInControl(event)) return;
			this.openResponseModal(record);
		});
		card.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			if (this.eventStartedInControl(event)) return;
			event.preventDefault();
			this.openResponseModal(record);
		});

		const titleProperty = this.mobileTitleProperty(properties, requestType);
		const header = card.createDiv({ cls: "pickle-mobile-card-header" });
		const main = header.createDiv({ cls: "pickle-mobile-main" });
		const titleValue = this.propertyValue(requestRow, titleProperty);
		const title = main.createEl("button", {
			cls: "pickle-file-link pickle-mobile-title",
			text: titleValue.text || record.path,
			type: "button",
		});
		title.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.openRecord(record);
		});

		const summary = this.contextTask(record);
		if (summary.length > 0) {
			main.createDiv({
				cls: "pickle-mobile-summary",
				text: summary,
			});
		}

		this.renderActionButton(header.createDiv({ cls: "pickle-mobile-action" }), record);

		const chips = card.createDiv({ cls: "pickle-mobile-chips" });
		for (const property of properties) {
			const key = this.propertyKey(property);
			if (key !== "priority" && key !== "status" && key !== "kind") continue;
			const model = this.propertyRenderModel(property, requestType);
			const { text } = this.propertyValue(requestRow, property);
			this.renderTypedCell(chips, record, model, text);
		}
		if (chips.childElementCount === 0) chips.remove();

		const metaItems = [
			this.mobileMetaText(requestRow, "source", properties, requestType),
			this.mobileMetaText(requestRow, "created_at", properties, requestType),
		].filter((item) => item.length > 0);
		if (metaItems.length > 0) {
			card.createDiv({
				cls: "pickle-mobile-meta",
				text: metaItems.join(" / "),
			});
		}

		const fields = card.createDiv({ cls: "pickle-mobile-fields" });
		for (const property of properties) {
			if (this.isMobilePromotedProperty(property, titleProperty)) continue;
			this.renderMobileField(fields, requestRow, property, requestType);
		}
		if (fields.childElementCount === 0) fields.remove();
	}

	private renderMobileField(
		parent: HTMLElement,
		requestRow: PickleRequestRow,
		property: BasesPropertyId,
		requestType: TypeDefinition | null
	): void {
		const model = this.propertyRenderModel(property, requestType);
		const { text } = this.propertyValue(requestRow, property);
		if (text.length === 0) return;

		const field = parent.createDiv({
			cls: [
				"pickle-mobile-field",
				`pickle-mobile-field-${this.classToken(model.key)}`,
			].join(" "),
		});
		field.createDiv({
			cls: "pickle-mobile-label",
			text: this.displayName(property),
		});
		const value = field.createDiv({ cls: "pickle-mobile-value" });
		if (this.opensRequest(property)) {
			const button = value.createEl("button", {
				cls: "pickle-file-link",
				text,
				type: "button",
			});
			button.addEventListener("click", (event) => {
				event.stopPropagation();
				void this.openRecord(requestRow.record);
			});
			return;
		}

		this.renderTypedCell(value, requestRow.record, model, text);
	}

	private renderActionButton(parent: HTMLElement, record: PickleRequestRecord): void {
		const isAnswered = this.isAnswered(record);
		const isConflict = record.derivedStatus === "conflict";
		const isCancelled = record.derivedStatus === "cancelled";
		const tooltip = isConflict
			? "Resolve multiple responses"
			: isAnswered
				? "Edit response"
				: isCancelled
					? "View cancelled request"
					: "Respond to request";
		const responseButton = new ButtonComponent(parent)
			.setIcon(isAnswered ? "file-check" : isConflict ? "triangle-alert" : PICKLE_ICON_ID)
			.setTooltip(tooltip)
			.onClick(() => {
				this.openResponseModal(record);
			});
		responseButton.buttonEl.setAttr("aria-label", tooltip);
		responseButton.buttonEl.addClass("pickle-action-button");
		if (record.derivedStatus === "pending") responseButton.buttonEl.addClass("mod-cta");
		responseButton.buttonEl.addEventListener("click", (event) => {
			event.stopPropagation();
		});
	}

	private mobileTitleProperty(
		properties: BasesPropertyId[],
		requestType: TypeDefinition | null
	): BasesPropertyId {
		return (
			properties.find((property) => this.propertyRenderModel(property, requestType).isDisplayName) ??
			this.propertyWithKey(properties, "title") ??
			this.propertyWithKey(properties, "file.name") ??
			"note.title"
		);
	}

	private mobileMetaText(
		requestRow: PickleRequestRow,
		key: string,
		properties: BasesPropertyId[],
		requestType: TypeDefinition | null
	): string {
		const property = this.propertyWithKey(properties, key);
		if (!property) return "";

		const model = this.propertyRenderModel(property, requestType);
		const { text } = this.propertyValue(requestRow, property);
		if (text.length === 0) return "";
		if (model.definition?.type === "datetime") return this.formatDate(text);
		return text;
	}

	private isMobilePromotedProperty(
		property: BasesPropertyId,
		titleProperty: BasesPropertyId
	): boolean {
		if (property === titleProperty) return true;
		const key = this.propertyKey(property);
		return (
			key === "title" ||
			key === "priority" ||
			key === "status" ||
			key === "kind" ||
			key === "source" ||
			key === "created_at"
		);
	}

	private propertyWithKey(
		properties: BasesPropertyId[],
		key: string
	): BasesPropertyId | undefined {
		return properties.find((property) => this.propertyKey(property) === key);
	}

	private displayName(property: BasesPropertyId): string {
		const key = this.propertyKey(property);
		const configured = this.config.getDisplayName(property).trim();
		if (configured.length > 0 && configured !== property && configured !== key) {
			if (key !== "file.name" || configured !== "file name") return configured;
		}

		if (key === "file.name") return "File";
		const label = key.replace(/[_-]+/gu, " ");
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	private propertyValue(
		requestRow: PickleRequestRow,
		property: BasesPropertyId
	): { value: Value | null; fallback: string; text: string } {
		const value = requestRow.entry.getValue(property);
		const fallback = this.recordPropertyValue(requestRow.record, property);
		return {
			value,
			fallback,
			text: this.valueText(value, fallback),
		};
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
				"pickle-cell",
				`pickle-cell-${this.classToken(model.key)}`,
				`pickle-cell-type-${this.classToken(model.definition?.type ?? "unknown")}`,
			].join(" "),
		});
		cell.setAttr("data-label", this.displayName(property));
		const { text } = this.propertyValue(requestRow, property);

		if (model.isDisplayName) {
			this.renderTitleCell(cell, requestRow, text);
			return;
		}

		if (this.opensRequest(property)) {
			const button = cell.createEl("button", {
				cls: "pickle-file-link",
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
					cls: "pickle-date",
					text: this.formatDate(text),
				});
				return;
			case "boolean":
				this.renderPill(parent, text || "false", model.key);
				return;
			case "integer":
			case "number":
				parent.createSpan({
					cls: "pickle-number",
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
					cls: "pickle-text-value",
					text,
				});
		}
	}

	private renderTitleCell(
		parent: HTMLElement,
		requestRow: PickleRequestRow,
		title: string
	): void {
		const titleStack = parent.createDiv({ cls: "pickle-title-stack" });
		const button = titleStack.createEl("button", {
			cls: "pickle-file-link pickle-title-link",
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
				cls: "pickle-title-meta",
				text: details.join(" / "),
			});
		}
	}

	private renderPill(parent: HTMLElement, value: string, fieldName: string): void {
		const normalized = value.trim().length > 0 ? value.trim() : "unknown";
		parent.createSpan({
			cls: [
				"pickle-pill",
				`pickle-pill-${this.classToken(fieldName)}`,
				`pickle-pill-${this.classToken(fieldName)}-${this.classToken(normalized)}`,
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
			parent.createSpan({ cls: "pickle-text-value is-empty", text: "None" });
			return;
		}

		const list = parent.createDiv({ cls: "pickle-list-value" });
		for (const item of items.slice(0, 3)) {
			list.createSpan({ cls: "pickle-list-item", text: item });
		}
		if (items.length > 3) {
			list.createSpan({
				cls: "pickle-list-more",
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
			parent.createSpan({ cls: "pickle-text-value", text: fallback });
			return;
		}

		const objectValue = value as Record<string, unknown>;
		const preferredKeys = Object.keys(definition?.fields ?? {});
		const keys = preferredKeys.length > 0 ? preferredKeys : Object.keys(objectValue);
		const firstKey = keys.find((key) => objectValue[key] !== undefined);
		if (!firstKey) {
			parent.createSpan({ cls: "pickle-text-value is-empty", text: "Empty" });
			return;
		}

		const visibleKeys = Object.keys(objectValue).filter((key) => objectValue[key] !== undefined);
		const preview = parent.createSpan({ cls: "pickle-object-value" });
		preview.createSpan({
			cls: "pickle-object-key",
			text: `${firstKey}: `,
		});
		preview.createSpan({
			cls: "pickle-object-preview",
			text: String(objectValue[firstKey]),
		});
		if (visibleKeys.length > 1) {
			preview.createSpan({
				cls: "pickle-object-more",
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
		if (key === "status") return record.derivedStatus;
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
		return record.derivedStatus === "answered";
	}

	private statusFor(record: PickleRequestRecord): string {
		return record.derivedStatus;
	}

	private enumText(record: PickleRequestRecord, key: string, fallback: string): string {
		if (key === "status") return this.statusFor(record);
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

	private selectedRequestState(): PickleRequestViewState {
		const configured = this.config.get("state");
		if (isRequestViewState(configured)) return configured;

		const name = this.config.name.toLowerCase();
		if (name.includes("pending")) return "pending";
		if (name.includes("answered")) return "answered";
		if (name.includes("conflict")) return "conflict";
		if (name.includes("cancelled")) return "cancelled";
		return "all";
	}

	private matchesSelectedState(
		record: PickleRequestRecord,
		selectedState: PickleRequestViewState
	): boolean {
		return selectedState === "all" || record.derivedStatus === selectedState;
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
		options: (): BasesAllOptions[] => [
			{
				key: "state",
				type: "dropdown",
				displayName: "Request state",
				default: "all",
				options: {
					all: "All",
					pending: "Pending",
					answered: "Answered",
					conflict: "Conflict",
					cancelled: "Cancelled",
				},
			},
		],
	};
}

function isRequestViewState(value: unknown): value is PickleRequestViewState {
	return (
		value === "all" ||
		value === "pending" ||
		value === "answered" ||
		value === "conflict" ||
		value === "cancelled"
	);
}
