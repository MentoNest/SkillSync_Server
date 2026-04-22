"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadonlyVisitor = void 0;
const ts = __importStar(require("typescript"));
const merge_options_1 = require("../merge-options");
const is_filename_matched_util_1 = require("../utils/is-filename-matched.util");
const controller_class_visitor_1 = require("./controller-class.visitor");
const model_class_visitor_1 = require("./model-class.visitor");
function collectProjectReferenceSourceFiles(projectReferences, visitedProjects = new Set()) {
    if (!projectReferences) {
        return [];
    }
    const sourceFiles = [];
    for (const ref of projectReferences) {
        const refConfigPath = ts.resolveProjectReferencePath(ref);
        if (visitedProjects.has(refConfigPath)) {
            continue;
        }
        visitedProjects.add(refConfigPath);
        const parsedRef = ts.getParsedCommandLineOfConfigFile(refConfigPath, undefined, ts.sys);
        if (parsedRef) {
            sourceFiles.push(...parsedRef.fileNames);
            sourceFiles.push(...collectProjectReferenceSourceFiles(parsedRef.projectReferences, visitedProjects));
        }
    }
    return sourceFiles;
}
class ReadonlyVisitor {
    static createTsProgram(tsconfigPath) {
        let parseError;
        const host = Object.assign(Object.assign({}, ts.sys), { onUnRecoverableConfigFileDiagnostic(diagnostic) {
                parseError = diagnostic;
            } });
        const parsedCmd = ts.getParsedCommandLineOfConfigFile(tsconfigPath, undefined, host);
        if (!parsedCmd || parseError) {
            const message = parseError
                ? ts.flattenDiagnosticMessageText(parseError.messageText, '\n')
                : tsconfigPath;
            throw new Error(`Failed to parse tsconfig at path: ${message}`);
        }
        const { options, fileNames, projectReferences } = parsedCmd;
        const referencedSourceFiles = collectProjectReferenceSourceFiles(projectReferences);
        const rootNames = [...new Set([...fileNames, ...referencedSourceFiles])];
        return ts.createProgram({ options, rootNames });
    }
    get typeImports() {
        return Object.assign(Object.assign({}, this.modelClassVisitor.typeImports), this.controllerClassVisitor.typeImports);
    }
    constructor(options) {
        this.options = options;
        this.key = '@nestjs/swagger';
        this.modelClassVisitor = new model_class_visitor_1.ModelClassVisitor();
        this.controllerClassVisitor = new controller_class_visitor_1.ControllerClassVisitor();
        options.readonly = true;
        if (!options.pathToSource) {
            throw new Error(`"pathToSource" must be defined in plugin options`);
        }
    }
    visit(program, sf) {
        const factoryHost = { factory: ts.factory };
        const parsedOptions = (0, merge_options_1.mergePluginOptions)(this.options);
        if ((0, is_filename_matched_util_1.isFilenameMatched)(parsedOptions.dtoFileNameSuffix, sf.fileName)) {
            return this.modelClassVisitor.visit(sf, factoryHost, program, parsedOptions);
        }
        if ((0, is_filename_matched_util_1.isFilenameMatched)(parsedOptions.controllerFileNameSuffix, sf.fileName)) {
            return this.controllerClassVisitor.visit(sf, factoryHost, program, parsedOptions);
        }
    }
    collect() {
        return {
            models: this.modelClassVisitor.collectedMetadata(this.options),
            controllers: this.controllerClassVisitor.collectedMetadata(this.options)
        };
    }
}
exports.ReadonlyVisitor = ReadonlyVisitor;
