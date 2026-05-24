import { addIcon } from "obsidian";

export const PICKLE_ICON_ID = "pickle-green";

const PICKLE_ICON_SVG = `
<path fill="#65b741" stroke="none" d="M12 92C-2 78 7 43 29 21 51-1 84-8 98 7c14 15 5 50-18 72-22 22-54 27-68 13Z"/>
<path fill="#2f7d32" stroke="none" d="M32 65a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm9-40a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm24-9a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm12 26a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/>
<path fill="none" stroke="#2f7d32" stroke-linecap="round" stroke-width="8" d="M50 62c6 5 17 2 23-6"/>
`;

export function registerPickleIcon(): void {
	addIcon(PICKLE_ICON_ID, PICKLE_ICON_SVG);
}
