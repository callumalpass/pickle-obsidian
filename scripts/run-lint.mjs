import { spawnSync } from "node:child_process";

const commands = [
	["npm", ["run", "lint:ts"]],
	["npm", ["run", "lint:css"]],
];

for (const [command, args] of commands) {
	const result = spawnSync(command, args, {
		stdio: "inherit",
		shell: process.platform === "win32",
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
