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
exports.typeReferenceToIdentifier = typeReferenceToIdentifier;
const path_1 = require("path");
const ts = __importStar(require("typescript"));
const plugin_debug_logger_1 = require("../plugin-debug-logger");
const plugin_utils_1 = require("./plugin-utils");
function typeReferenceToIdentifier(typeReferenceDescriptor, hostFilename, options, factory, type, typeImports) {
    if (options.readonly) {
        assertReferenceableType(type, typeReferenceDescriptor.typeName, hostFilename, options);
    }
    const { typeReference, importPath, typeName } = (0, plugin_utils_1.replaceImportPath)(typeReferenceDescriptor.typeName, hostFilename, options);
    let identifier;
    if (options.readonly && (typeReference === null || typeReference === void 0 ? void 0 : typeReference.includes('import'))) {
        if (!typeImports[importPath]) {
            typeImports[importPath] = typeReference;
        }
        let ref = `t["${importPath}"].${typeName}`;
        if (typeReferenceDescriptor.isArray) {
            ref = wrapTypeInArray(ref, typeReferenceDescriptor.arrayDepth);
        }
        identifier = factory.createIdentifier(ref);
    }
    else if (options.readonly &&
        !(typeReference === null || typeReference === void 0 ? void 0 : typeReference.includes('import')) &&
        isSameFileUserType(type, hostFilename)) {
        const sameFileImportPath = buildSameFileImportPath(hostFilename, options);
        const syntheticImportRef = `await import("${sameFileImportPath}")`;
        if (!typeImports[sameFileImportPath]) {
            typeImports[sameFileImportPath] = syntheticImportRef;
        }
        let ref = `t["${sameFileImportPath}"].${typeReferenceDescriptor.typeName}`;
        if (typeReferenceDescriptor.isArray) {
            ref = wrapTypeInArray(ref, typeReferenceDescriptor.arrayDepth);
        }
        identifier = factory.createIdentifier(ref);
    }
    else {
        let ref = typeReference;
        if (typeReferenceDescriptor.isArray) {
            ref = wrapTypeInArray(ref, typeReferenceDescriptor.arrayDepth);
        }
        identifier = factory.createIdentifier(ref);
    }
    return identifier;
}
function isSameFileUserType(type, hostFilename) {
    if (!type.symbol || !type.symbol.declarations) {
        return false;
    }
    const normalizedHost = (0, plugin_utils_1.convertPath)(hostFilename);
    return type.symbol.declarations.some((decl) => {
        const declFile = (0, plugin_utils_1.convertPath)(decl.getSourceFile().fileName);
        return (declFile === normalizedHost && !decl.getSourceFile().isDeclarationFile);
    });
}
function buildSameFileImportPath(hostFilename, options) {
    const from = (0, plugin_utils_1.convertPath)(options.pathToSource);
    const to = (0, plugin_utils_1.convertPath)(hostFilename).replace(/\.[jt]s$/, '');
    let relativePath = path_1.posix.relative(from, to);
    if (relativePath[0] !== '.') {
        relativePath = './' + relativePath;
    }
    if (options.esmCompatible) {
        relativePath += (0, plugin_utils_1.getOutputExtension)(hostFilename);
    }
    return relativePath;
}
function wrapTypeInArray(typeRef, arrayDepth) {
    for (let i = 0; i < arrayDepth; i++) {
        typeRef = `[${typeRef}]`;
    }
    return typeRef;
}
function assertReferenceableType(type, parsedTypeName, hostFilename, options) {
    var _a;
    if (!type.symbol) {
        return true;
    }
    if (parsedTypeName.includes('import')) {
        return true;
    }
    if (!isSameFileUserType(type, hostFilename)) {
        return true;
    }
    const declarations = (_a = type.symbol.declarations) !== null && _a !== void 0 ? _a : (type.symbol.valueDeclaration
        ? [type.symbol.valueDeclaration]
        : []);
    const isExported = declarations.some((decl) => {
        var _a;
        if (!decl)
            return false;
        return (ts.canHaveModifiers(decl) &&
            ((_a = ts.getModifiers(decl)) === null || _a === void 0 ? void 0 : _a.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)));
    });
    if (isExported) {
        return true;
    }
    const errorMessage = `Type "${parsedTypeName}" is not referenceable ("${hostFilename}"). To fix this, make sure to export this type.`;
    if (options.debug) {
        plugin_debug_logger_1.pluginDebugLogger.debug(errorMessage);
    }
    throw new Error(errorMessage);
}
