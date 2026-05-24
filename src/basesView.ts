import {
	BasesView,
	ButtonComponent,
	type BasesEntry,
	type BasesPropertyId,
	type BasesViewRegistration,
	type QueryController,
	type Value,
} from "obsidian";
import { BASES_VIEW_TYPE } from "./constants";
import type { PickleCollectionService } from "./collectionService";
import { collectionRelativePath } from "./path";
import { PickleResponseModal } from "./responseModal";
import type { PickleRequestRecord } from "./types";

const DEFAULT_PROPERTY_ORDER = [
	"note.title",
	"note.priority",
	"note.response_type",
	"note.created_at",
] satisfies BasesPropertyId[];

interface PickleRequestRow {
	entry: BasesEntry;
	record: PickleRequestRecord;
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
		const rows = await this.rowsForEntries(entries);
		if (renderVersion !== this.renderVersion) return;

		const properties = this.visibleProperties();
		this.containerEl.empty();
		this.containerEl.createDiv({
			cls: "pickle-approval-center-meta",
			text: `${rows.length} request${rows.length === 1 ? "" : "s"}`,
		});

		if (rows.length === 0) {
			this.containerEl.createDiv({
				cls: "pickle-approval-center-empty",
				text: "No Pickle requests in this view.",
			});
			return;
		}

		const table = this.containerEl.createEl("table", {
			cls: "pickle-approval-center-table",
		});
		const header = table.createEl("thead").createEl("tr");
		for (const property of properties) {
			header.createEl("th", { text: this.config.getDisplayName(property) });
		}
		header.createEl("th");

		const body = table.createEl("tbody");
		for (const row of rows) {
			this.renderRow(body, row, properties);
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
		properties: BasesPropertyId[]
	): void {
		const { record } = requestRow;
		const row = parent.createEl("tr");
		row.addClass("pickle-approval-center-row");
		row.tabIndex = 0;
		row.addEventListener("click", (event) => {
			if (this.eventStartedInControl(event)) return;
			void this.openRecord(record);
		});
		row.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			if (this.eventStartedInControl(event)) return;
			event.preventDefault();
			void this.openRecord(record);
		});

		for (const property of properties) {
			this.renderPropertyCell(row, requestRow, property);
		}
		const actionCell = row.createEl("td");
		const responseButton = new ButtonComponent(actionCell)
			.setIcon("check-circle")
			.setTooltip("Respond")
			.onClick(() => {
				new PickleResponseModal(this.app, this.service, record).open();
			});
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
		property: BasesPropertyId
	): void {
		const cell = parent.createEl("td");
		const value = requestRow.entry.getValue(property);
		const fallback = this.recordPropertyValue(requestRow.record, property);
		const text = this.valueText(value, fallback);

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

		cell.setText(text);
	}

	private async openRecord(record: PickleRequestRecord): Promise<void> {
		await this.app.workspace.openLinkText(record.vaultPath, this.service.baseVaultPath, false);
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
		return "";
	}

	private opensRequest(property: BasesPropertyId): boolean {
		return property === "file.name" || property.endsWith(".title");
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
		icon: "check-circle",
		factory: (controller, containerEl) =>
			new PickleRequestsBasesView(controller, containerEl, service),
	};
}
