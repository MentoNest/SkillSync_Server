"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeScriptBinaryLoader = void 0;
const ui_1 = require("../ui");
class TypeScriptBinaryLoader {
    load() {
        if (this.tsBinary) {
            return this.tsBinary;
        }
        let tsBinary;
        try {
            const tsBinaryPath = require.resolve('typescript', {
                paths: [process.cwd(), ...this.getModulePaths()],
            });
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            tsBinary = require(tsBinaryPath);
        }
        catch {
            throw new Error('TypeScript could not be found! Please, install "typescript" package.');
        }
        this.assertProgrammaticApiIsSupported(tsBinary);
        this.tsBinary = tsBinary;
        return tsBinary;
    }
    assertProgrammaticApiIsSupported(tsBinary) {
        if (typeof tsBinary.getParsedCommandLineOfConfigFile !== 'function') {
            throw new Error(ui_1.CLI_ERRORS.UNSUPPORTED_TYPESCRIPT_VERSION(tsBinary.version));
        }
    }
    getModulePaths() {
        const modulePaths = module.paths.slice(2, module.paths.length);
        const packageDeps = modulePaths.slice(0, 3);
        return [
            ...packageDeps.reverse(),
            ...modulePaths.slice(3, modulePaths.length).reverse(),
        ];
    }
}
exports.TypeScriptBinaryLoader = TypeScriptBinaryLoader;
