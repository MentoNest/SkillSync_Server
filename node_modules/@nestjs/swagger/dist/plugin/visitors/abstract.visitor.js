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
exports.AbstractFileVisitor = void 0;
const ts = __importStar(require("typescript"));
const plugin_constants_1 = require("../plugin-constants");
const [major, minor] = ts.versionMajorMinor.split('.').map((x) => +x);
class AbstractFileVisitor {
    updateImports(sourceFile, factory, program) {
        if (major <= 4 && minor < 8) {
            throw new Error('Nest CLI plugin does not support TypeScript < v4.8');
        }
        const importEqualsDeclaration = factory.createImportEqualsDeclaration(undefined, false, factory.createIdentifier(plugin_constants_1.OPENAPI_NAMESPACE), factory.createExternalModuleReference(factory.createStringLiteral(plugin_constants_1.OPENAPI_PACKAGE_NAME)));
        const compilerOptions = program.getCompilerOptions();
        if (compilerOptions.module >= ts.ModuleKind.ES2015 &&
            compilerOptions.module <= ts.ModuleKind.ESNext) {
            const importAsDeclaration = factory.createImportDeclaration(undefined, factory.createImportClause(false, undefined, factory.createNamespaceImport(factory.createIdentifier(plugin_constants_1.OPENAPI_NAMESPACE))), factory.createStringLiteral(plugin_constants_1.OPENAPI_PACKAGE_NAME), undefined);
            return factory.updateSourceFile(sourceFile, [
                importAsDeclaration,
                ...sourceFile.statements
            ]);
        }
        else {
            return factory.updateSourceFile(sourceFile, [
                importEqualsDeclaration,
                ...sourceFile.statements
            ]);
        }
    }
}
exports.AbstractFileVisitor = AbstractFileVisitor;
