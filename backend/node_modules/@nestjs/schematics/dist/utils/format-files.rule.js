"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFiles = formatFiles;
const FORMATTABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
function formatFiles(paths) {
    return async (tree, _context) => {
        let prettier;
        try {
            prettier = await Promise.resolve().then(() => require('prettier'));
        }
        catch {
            return tree;
        }
        const candidates = (paths ??
            tree.actions
                .filter((action) => action.kind === 'c' ||
                action.kind === 'o' ||
                action.kind === 'r')
                .map((action) => action.path))
            .map((p) => (typeof p === 'string' ? p : String(p)))
            .filter((p) => FORMATTABLE_EXTENSIONS.some((ext) => p.endsWith(ext)));
        const uniquePaths = Array.from(new Set(candidates));
        for (const filePath of uniquePaths) {
            if (!tree.exists(filePath)) {
                continue;
            }
            const buffer = tree.read(filePath);
            if (!buffer) {
                continue;
            }
            const source = buffer.toString('utf-8');
            try {
                const resolvedOptions = (await prettier.resolveConfig(filePath)) ?? undefined;
                const formatted = await prettier.format(source, {
                    ...resolvedOptions,
                    filepath: filePath,
                });
                if (formatted !== source) {
                    tree.overwrite(filePath, formatted);
                }
            }
            catch {
                continue;
            }
        }
        return tree;
    };
}
