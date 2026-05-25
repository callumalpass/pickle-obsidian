import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_DESTINATION =
	"/home/calluma/testvault/test/.obsidian/plugins/pickle";
const FILES = ["main.js", "styles.css", "manifest.json"];

function expandTilde(value) {
	return value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

function getDestinations() {
	if (process.env.OBSIDIAN_PLUGIN_PATH) {
		return [expandTilde(process.env.OBSIDIAN_PLUGIN_PATH)];
	}

	const localFile = resolve(process.cwd(), ".copy-files.local");
	if (existsSync(localFile)) {
		const destinations = readFileSync(localFile, "utf8")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith("#"))
			.map(expandTilde);

		if (destinations.length > 0) return destinations;
	}

	return [DEFAULT_DESTINATION];
}

for (const destination of getDestinations()) {
	mkdirSync(destination, { recursive: true });

	for (const file of FILES) {
		const source = resolve(process.cwd(), file);
		if (!existsSync(source)) {
			throw new Error(`Missing build artifact: ${file}`);
		}
		copyFileSync(source, join(destination, file));
	}

	console.log(`Copied Pickle to ${destination}`);
}
