import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { TFile, type App } from "obsidian";

export function createFakeApp(root: string): App {
	const pathFor = (vaultPath: string): string => join(root, vaultPath);
	const fileFor = (vaultPath: string): TFile => {
		const file = Object.create(TFile.prototype) as TFile;
		Object.defineProperty(file, "path", {
			value: vaultPath,
			configurable: true,
		});
		return file;
	};

	const vault = {
		adapter: {
			writeBinary: async (vaultPath: string, data: ArrayBuffer): Promise<void> => {
				const absolutePath = pathFor(vaultPath);
				await mkdir(dirname(absolutePath), { recursive: true });
				await writeFile(absolutePath, Buffer.from(data));
			},
		},
		getAbstractFileByPath: (vaultPath: string): { path: string } | TFile | null => {
			const absolutePath = pathFor(vaultPath);
			if (!existsSync(absolutePath)) return null;
			if (!statSync(absolutePath).isFile()) return { path: vaultPath };
			return fileFor(vaultPath);
		},
		getMarkdownFiles: (): TFile[] => {
			return listMarkdownFiles(root).map(fileFor);
		},
		createFolder: async (vaultPath: string): Promise<void> => {
			await mkdir(pathFor(vaultPath));
		},
		create: async (vaultPath: string, content: string): Promise<TFile> => {
			const absolutePath = pathFor(vaultPath);
			await mkdir(dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, content);
			return fileFor(vaultPath);
		},
		cachedRead: async (file: { path: string }): Promise<string> => {
			return await readFile(pathFor(file.path), "utf8");
		},
		modify: async (file: { path: string }, content: string): Promise<void> => {
			await writeFile(pathFor(file.path), content);
		},
	};

	return { vault } as unknown as App;
}

function listMarkdownFiles(root: string, folder = ""): string[] {
	const absoluteFolder = join(root, folder);
	if (!existsSync(absoluteFolder)) return [];

	const files: string[] = [];
	for (const entry of readdirSync(absoluteFolder, { withFileTypes: true })) {
		const absolutePath = join(absoluteFolder, entry.name);
		if (entry.isDirectory()) {
			files.push(...listMarkdownFiles(root, relative(root, absolutePath)));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(relative(root, absolutePath).replace(/\\/gu, "/"));
		}
	}
	return files;
}
