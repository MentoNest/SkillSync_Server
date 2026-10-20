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
exports.ControllerClassVisitor = void 0;
const common_1 = require("@nestjs/common");
const lodash_1 = require("lodash");
const path_1 = require("path");
const ts = __importStar(require("typescript"));
const decorators_1 = require("../../decorators");
const plugin_constants_1 = require("../plugin-constants");
const ast_utils_1 = require("../utils/ast-utils");
const plugin_utils_1 = require("../utils/plugin-utils");
const type_reference_to_identifier_util_1 = require("../utils/type-reference-to-identifier.util");
const abstract_visitor_1 = require("./abstract.visitor");
class ControllerClassVisitor extends abstract_visitor_1.AbstractFileVisitor {
    constructor() {
        super(...arguments);
        this._collectedMetadata = {};
        this._typeImports = {};
    }
    get typeImports() {
        return this._typeImports;
    }
    collectedMetadata(options) {
        const metadataWithImports = [];
        Object.keys(this._collectedMetadata).forEach((filePath) => {
            const metadata = this._collectedMetadata[filePath];
            const fileExt = options.esmCompatible ? (0, plugin_utils_1.getOutputExtension)(filePath) : '';
            let path = filePath.replace(/\.[jt]s$/, fileExt);
            path = (0, plugin_utils_1.normalizePackagePath)(path);
            const importExpr = ts.factory.createCallExpression(ts.factory.createToken(ts.SyntaxKind.ImportKeyword), undefined, [ts.factory.createStringLiteral(path)]);
            metadataWithImports.push([importExpr, metadata]);
        });
        return metadataWithImports;
    }
    visit(sourceFile, ctx, program, options) {
        const typeChecker = program.getTypeChecker();
        if (!options.readonly) {
            sourceFile = this.updateImports(sourceFile, ctx.factory, program);
        }
        const visitNode = (node) => {
            var _a;
            if (ts.isMethodDeclaration(node)) {
                try {
                    const metadata = {};
                    const updatedNode = this.addDecoratorToNode(ctx.factory, node, typeChecker, options, sourceFile, metadata);
                    if (!options.readonly) {
                        return updatedNode;
                    }
                    else {
                        const filePath = this.normalizeImportPath(options.pathToSource, sourceFile.fileName);
                        if (!this._collectedMetadata[filePath]) {
                            this._collectedMetadata[filePath] = {};
                        }
                        const parent = node.parent;
                        const clsName = (_a = parent.name) === null || _a === void 0 ? void 0 : _a.getText();
                        if (clsName) {
                            if (!this._collectedMetadata[filePath][clsName]) {
                                this._collectedMetadata[filePath][clsName] = {};
                            }
                            Object.assign(this._collectedMetadata[filePath][clsName], metadata);
                        }
                    }
                }
                catch (_b) {
                    if (!options.readonly) {
                        return node;
                    }
                }
            }
            if (options.readonly) {
                ts.forEachChild(node, visitNode);
            }
            else {
                return ts.visitEachChild(node, visitNode, ctx);
            }
        };
        return ts.visitNode(sourceFile, visitNode);
    }
    addDecoratorToNode(factory, compilerNode, typeChecker, options, sourceFile, metadata) {
        var _a;
        const hostFilename = sourceFile.fileName;
        const decorators = ts.canHaveDecorators(compilerNode) && ts.getDecorators(compilerNode);
        if (!decorators) {
            return compilerNode;
        }
        const apiOperationDecoratorsArray = this.createApiOperationDecorator(factory, compilerNode, decorators, options, sourceFile, typeChecker, metadata);
        const apiResponseDecoratorsArray = this.createApiResponseDecorator(factory, compilerNode, options, metadata);
        const apiQueryDecoratorsArray = this.createApiQueryDecorators(factory, compilerNode, decorators);
        const apiParamDecoratorsArray = this.createApiParamDecorators(factory, compilerNode, decorators, typeChecker);
        const removeExistingApiOperationDecorator = apiOperationDecoratorsArray.length > 0;
        const existingDecorators = removeExistingApiOperationDecorator
            ? decorators.filter((item) => (0, ast_utils_1.getDecoratorName)(item) !== decorators_1.ApiOperation.name)
            : decorators;
        const hasExplicitApiResponseDecorator = decorators.some((item) => {
            try {
                const decoratorName = (0, ast_utils_1.getDecoratorName)(item);
                if (decoratorName === decorators_1.ApiResponse.name) {
                    return this.isSuccessOrRedirectApiResponseArg(item, typeChecker);
                }
                const statusNameMatch = decoratorName.match(/^Api(.+)Response$/);
                if (!statusNameMatch)
                    return false;
                const statusKey = statusNameMatch[1]
                    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                    .toUpperCase();
                const status = Number(common_1.HttpStatus[statusKey]);
                return isNaN(status) || status < 400;
            }
            catch (_a) {
                return false;
            }
        });
        const modifiers = (_a = ts.getModifiers(compilerNode)) !== null && _a !== void 0 ? _a : [];
        const objectLiteralExpr = this.createDecoratorObjectLiteralExpr(factory, compilerNode, typeChecker, factory.createNodeArray(), hostFilename, metadata, options);
        const autoGeneratedApiResponseDecorators = hasExplicitApiResponseDecorator
            ? []
            : [
                factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${plugin_constants_1.OPENAPI_NAMESPACE}.${decorators_1.ApiResponse.name}`), undefined, [
                    factory.createObjectLiteralExpression(objectLiteralExpr.properties)
                ]))
            ];
        const updatedDecorators = [
            ...apiOperationDecoratorsArray,
            ...apiResponseDecoratorsArray,
            ...apiQueryDecoratorsArray,
            ...apiParamDecoratorsArray,
            ...existingDecorators,
            ...autoGeneratedApiResponseDecorators
        ];
        if (!options.readonly) {
            return factory.updateMethodDeclaration(compilerNode, [...updatedDecorators, ...modifiers], compilerNode.asteriskToken, compilerNode.name, compilerNode.questionToken, compilerNode.typeParameters, compilerNode.parameters, compilerNode.type, compilerNode.body);
        }
        else {
            return compilerNode;
        }
    }
    createApiOperationDecorator(factory, node, decorators, options, sourceFile, typeChecker, metadata) {
        if (!options.introspectComments) {
            return [];
        }
        const apiOperationDecorator = (0, plugin_utils_1.getDecoratorOrUndefinedByNames)([decorators_1.ApiOperation.name], decorators, factory);
        let apiOperationExistingProps = undefined;
        if (apiOperationDecorator && !options.readonly) {
            const apiOperationExpr = (0, lodash_1.head)((0, ast_utils_1.getDecoratorArguments)(apiOperationDecorator));
            if (apiOperationExpr) {
                apiOperationExistingProps =
                    apiOperationExpr.properties;
            }
        }
        const extractedComments = (0, ast_utils_1.getMainCommentOfNode)(node);
        if (!extractedComments) {
            return [];
        }
        const properties = [
            ...(apiOperationExistingProps !== null && apiOperationExistingProps !== void 0 ? apiOperationExistingProps : factory.createNodeArray())
        ];
        const tags = (0, ast_utils_1.getTsDocTagsOfNode)(node, typeChecker);
        const existingPropsArray = factory.createNodeArray(apiOperationExistingProps);
        const hasRemarksKey = (0, plugin_utils_1.hasPropertyKey)('description', existingPropsArray);
        const unshiftIfNotExisting = (key, value) => {
            if ((0, plugin_utils_1.hasPropertyKey)(key, existingPropsArray)) {
                return;
            }
            properties.unshift(factory.createPropertyAssignment(key, factory.createStringLiteral(value)));
        };
        if (!hasRemarksKey && tags.remarks) {
            const remarksPropertyAssignment = factory.createPropertyAssignment('description', (0, ast_utils_1.createLiteralFromAnyValue)(factory, tags.remarks));
            properties.push(remarksPropertyAssignment);
            if (options.controllerKeyOfComment === 'description') {
                unshiftIfNotExisting('summary', extractedComments);
            }
            else {
                unshiftIfNotExisting(options.controllerKeyOfComment, extractedComments);
            }
        }
        else {
            unshiftIfNotExisting(options.controllerKeyOfComment, extractedComments);
        }
        const hasDeprecatedKey = (0, plugin_utils_1.hasPropertyKey)('deprecated', factory.createNodeArray(apiOperationExistingProps));
        if (!hasDeprecatedKey && tags.deprecated) {
            const deprecatedPropertyAssignment = factory.createPropertyAssignment('deprecated', (0, ast_utils_1.createLiteralFromAnyValue)(factory, tags.deprecated));
            properties.push(deprecatedPropertyAssignment);
        }
        const objectLiteralExpr = factory.createObjectLiteralExpression((0, lodash_1.compact)(properties));
        const apiOperationDecoratorArguments = factory.createNodeArray([objectLiteralExpr]);
        const methodKey = node.name.getText();
        if (metadata[methodKey]) {
            const existingObjectLiteralExpr = metadata[methodKey];
            const existingProperties = existingObjectLiteralExpr.properties;
            const updatedProperties = factory.createNodeArray([
                ...existingProperties,
                ...(0, lodash_1.compact)(properties)
            ]);
            const updatedObjectLiteralExpr = factory.createObjectLiteralExpression(updatedProperties);
            metadata[methodKey] = updatedObjectLiteralExpr;
        }
        else {
            metadata[methodKey] = objectLiteralExpr;
        }
        if (apiOperationDecorator) {
            const expr = apiOperationDecorator.expression;
            const updatedCallExpr = factory.updateCallExpression(expr, expr.expression, undefined, apiOperationDecoratorArguments);
            return [factory.updateDecorator(apiOperationDecorator, updatedCallExpr)];
        }
        else {
            return [
                factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${plugin_constants_1.OPENAPI_NAMESPACE}.${decorators_1.ApiOperation.name}`), undefined, apiOperationDecoratorArguments))
            ];
        }
    }
    createApiResponseDecorator(factory, node, options, metadata) {
        if (!options.introspectComments) {
            return [];
        }
        const tags = (0, ast_utils_1.getTsDocErrorsOfNode)(node);
        if (!tags.length) {
            return [];
        }
        return tags.map((tag) => {
            const properties = [];
            properties.push(factory.createPropertyAssignment('status', factory.createNumericLiteral(tag.status)));
            properties.push(factory.createPropertyAssignment('description', factory.createStringLiteral(tag.description)));
            const objectLiteralExpr = factory.createObjectLiteralExpression((0, lodash_1.compact)(properties));
            const methodKey = node.name.getText();
            metadata[methodKey] = objectLiteralExpr;
            const apiResponseDecoratorArguments = factory.createNodeArray([objectLiteralExpr]);
            return factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${plugin_constants_1.OPENAPI_NAMESPACE}.${decorators_1.ApiResponse.name}`), undefined, apiResponseDecoratorArguments));
        });
    }
    createApiQueryDecorators(factory, node, methodDecorators) {
        const parameters = node.parameters;
        if (!parameters || parameters.length === 0) {
            return [];
        }
        const existingApiQueryNames = (0, ast_utils_1.collectExistingApiParamNames)(methodDecorators, decorators_1.ApiQuery.name);
        if (existingApiQueryNames === null) {
            return [];
        }
        const generated = [];
        for (const parameter of parameters) {
            const queryName = (0, ast_utils_1.getNamedParamDecoratorArg)(parameter, 'Query');
            if (queryName === undefined) {
                continue;
            }
            if (existingApiQueryNames.has(queryName)) {
                continue;
            }
            if (!this.isParameterOptional(parameter)) {
                continue;
            }
            const objectLiteral = factory.createObjectLiteralExpression([
                factory.createPropertyAssignment('name', factory.createStringLiteral(queryName)),
                factory.createPropertyAssignment('required', factory.createFalse())
            ], false);
            generated.push(factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${plugin_constants_1.OPENAPI_NAMESPACE}.${decorators_1.ApiQuery.name}`), undefined, [objectLiteral])));
            existingApiQueryNames.add(queryName);
        }
        return generated;
    }
    createApiParamDecorators(factory, node, methodDecorators, typeChecker) {
        const parameters = node.parameters;
        if (parameters.length === 0) {
            return [];
        }
        const existingApiParamNames = (0, ast_utils_1.collectExistingApiParamNames)(methodDecorators, decorators_1.ApiParam.name);
        if (existingApiParamNames === null) {
            return [];
        }
        const generated = [];
        for (const parameter of parameters) {
            const paramName = (0, ast_utils_1.getNamedParamDecoratorArg)(parameter, 'Param');
            if (paramName === undefined) {
                continue;
            }
            if (existingApiParamNames.has(paramName)) {
                continue;
            }
            let type;
            try {
                type = typeChecker.getTypeAtLocation(parameter);
            }
            catch (_a) {
                type = undefined;
            }
            if (!type) {
                continue;
            }
            const literalUnion = (0, plugin_utils_1.getStringLiteralUnionValues)(type);
            if (!literalUnion || literalUnion.values.length === 0) {
                continue;
            }
            const enumArrayLiteral = factory.createArrayLiteralExpression(literalUnion.values.map((value) => typeof value === 'number'
                ? factory.createNumericLiteral(value)
                : factory.createStringLiteral(value)), false);
            const objectLiteral = factory.createObjectLiteralExpression([
                factory.createPropertyAssignment('name', factory.createStringLiteral(paramName)),
                factory.createPropertyAssignment('enum', enumArrayLiteral)
            ], false);
            generated.push(factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${plugin_constants_1.OPENAPI_NAMESPACE}.${decorators_1.ApiParam.name}`), undefined, [objectLiteral])));
            existingApiParamNames.add(paramName);
        }
        return generated;
    }
    isParameterOptional(parameter) {
        if (parameter.questionToken) {
            return true;
        }
        if (parameter.initializer) {
            return true;
        }
        if (parameter.type && ts.isUnionTypeNode(parameter.type)) {
            return parameter.type.types.some((t) => t.kind === ts.SyntaxKind.UndefinedKeyword);
        }
        return false;
    }
    createDecoratorObjectLiteralExpr(factory, node, typeChecker, existingProperties = factory.createNodeArray(), hostFilename, metadata, options) {
        let properties = [];
        if (!options.readonly && !options.skipAutoHttpCode) {
            properties = properties.concat(existingProperties, this.createStatusPropertyAssignment(factory, node, existingProperties));
        }
        properties = properties.concat([
            this.createTypePropertyAssignment(factory, node, typeChecker, existingProperties, hostFilename, options)
        ]);
        const objectLiteralExpr = factory.createObjectLiteralExpression((0, lodash_1.compact)(properties));
        const methodKey = node.name.getText();
        const existingExprOrUndefined = metadata[methodKey];
        if (existingExprOrUndefined) {
            const existingProperties = existingExprOrUndefined.properties;
            const updatedProperties = factory.createNodeArray([
                ...existingProperties,
                ...(0, lodash_1.compact)(properties)
            ]);
            const updatedObjectLiteralExpr = factory.createObjectLiteralExpression(updatedProperties);
            metadata[methodKey] = updatedObjectLiteralExpr;
        }
        else {
            metadata[methodKey] = objectLiteralExpr;
        }
        return objectLiteralExpr;
    }
    createTypePropertyAssignment(factory, node, typeChecker, existingProperties, hostFilename, options) {
        if ((0, plugin_utils_1.hasPropertyKey)('type', existingProperties)) {
            return undefined;
        }
        const signature = typeChecker.getSignatureFromDeclaration(node);
        const type = typeChecker.getReturnTypeOfSignature(signature);
        if (!type) {
            return undefined;
        }
        const typeReferenceDescriptor = (0, plugin_utils_1.getTypeReferenceAsString)(type, typeChecker);
        if (!typeReferenceDescriptor.typeName) {
            return undefined;
        }
        if (typeReferenceDescriptor.typeName.includes('node_modules')) {
            return undefined;
        }
        const identifier = (0, type_reference_to_identifier_util_1.typeReferenceToIdentifier)(typeReferenceDescriptor, hostFilename, options, factory, type, this._typeImports);
        return factory.createPropertyAssignment('type', identifier);
    }
    createStatusPropertyAssignment(factory, node, existingProperties) {
        if ((0, plugin_utils_1.hasPropertyKey)('status', existingProperties)) {
            return undefined;
        }
        const statusNode = this.getStatusCodeIdentifier(factory, node);
        return factory.createPropertyAssignment('status', statusNode);
    }
    getStatusCodeIdentifier(factory, node) {
        const decorators = ts.canHaveDecorators(node) && ts.getDecorators(node);
        const httpCodeDecorator = (0, plugin_utils_1.getDecoratorOrUndefinedByNames)(['HttpCode'], decorators, factory);
        if (httpCodeDecorator) {
            const argument = (0, lodash_1.head)((0, ast_utils_1.getDecoratorArguments)(httpCodeDecorator));
            if (argument) {
                return argument;
            }
        }
        const postDecorator = (0, plugin_utils_1.getDecoratorOrUndefinedByNames)(['Post'], decorators, factory);
        if (postDecorator) {
            return factory.createIdentifier('201');
        }
        return factory.createIdentifier('200');
    }
    normalizeImportPath(pathToSource, path) {
        let relativePath = path_1.posix.relative((0, plugin_utils_1.convertPath)(pathToSource), (0, plugin_utils_1.convertPath)(path));
        relativePath = relativePath[0] !== '.' ? './' + relativePath : relativePath;
        return relativePath;
    }
    isSuccessOrRedirectApiResponseArg(decorator, typeChecker) {
        const [firstArg] = (0, ast_utils_1.getDecoratorArguments)(decorator);
        if (!firstArg || !ts.isObjectLiteralExpression(firstArg))
            return true;
        const statusProp = firstArg.properties.find((p) => ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === 'status');
        if (!statusProp)
            return true;
        const init = statusProp.initializer;
        if (ts.isNumericLiteral(init))
            return Number(init.text) < 400;
        if (ts.isStringLiteral(init)) {
            return (init.text === '1XX' ||
                init.text === '2XX' ||
                init.text === '3XX' ||
                init.text === 'default');
        }
        if (ts.isPropertyAccessExpression(init) ||
            ts.isElementAccessExpression(init)) {
            const constantValue = typeChecker.getConstantValue(init);
            if (typeof constantValue === 'number') {
                return constantValue < 400;
            }
            if (ts.isPropertyAccessExpression(init) &&
                ts.isIdentifier(init.expression) &&
                init.expression.text === 'HttpStatus') {
                const status = common_1.HttpStatus[init.name.text];
                if (typeof status === 'number') {
                    return status < 400;
                }
            }
        }
        return true;
    }
}
exports.ControllerClassVisitor = ControllerClassVisitor;
