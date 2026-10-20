"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepPartialType = DeepPartialType;
const mapped_types_1 = require("@nestjs/mapped-types");
const lodash_1 = require("lodash");
const constants_1 = require("../constants");
const decorators_1 = require("../decorators");
const metadata_loader_1 = require("../plugin/metadata-loader");
const plugin_constants_1 = require("../plugin/plugin-constants");
const model_properties_accessor_1 = require("../services/model-properties-accessor");
const mapped_types_utils_1 = require("./mapped-types.utils");
const modelPropertiesAccessor = new model_properties_accessor_1.ModelPropertiesAccessor();
const deepPartialCache = new Map();
function isDtoClass(typeRef) {
    if (!typeRef ||
        typeof typeRef !== 'function' ||
        typeRef === String ||
        typeRef === Number ||
        typeRef === Boolean ||
        typeRef === Object ||
        typeRef === Array ||
        typeRef === Date) {
        return false;
    }
    if (!typeRef.prototype) {
        return false;
    }
    const fields = modelPropertiesAccessor.getModelProperties(typeRef.prototype);
    if (fields.length > 0) {
        return true;
    }
    return (typeof typeRef[plugin_constants_1.METADATA_FACTORY_NAME] === 'function');
}
function DeepPartialType(classRef, options = {}) {
    if (deepPartialCache.has(classRef)) {
        return deepPartialCache.get(classRef);
    }
    const applyPartialDecoratorFn = options.skipNullProperties === false
        ? mapped_types_1.applyValidateIfDefinedDecorator
        : mapped_types_1.applyIsOptionalDecorator;
    const fields = modelPropertiesAccessor.getModelProperties(classRef.prototype);
    class DeepPartialTypeClass {
        constructor() {
            (0, mapped_types_1.inheritPropertyInitializers)(this, classRef);
        }
    }
    deepPartialCache.set(classRef, DeepPartialTypeClass);
    const keysWithValidationConstraints = (0, mapped_types_1.inheritValidationMetadata)(classRef, DeepPartialTypeClass);
    if (keysWithValidationConstraints) {
        keysWithValidationConstraints
            .filter((key) => !fields.includes(key))
            .forEach((key) => applyPartialDecoratorFn(DeepPartialTypeClass, key));
    }
    (0, mapped_types_1.inheritTransformationMetadata)(classRef, DeepPartialTypeClass);
    function applyFields(fields) {
        (0, mapped_types_utils_1.clonePluginMetadataFactory)(DeepPartialTypeClass, classRef.prototype, (metadata) => (0, lodash_1.mapValues)(metadata, (item) => (Object.assign(Object.assign({}, item), { required: false }))));
        function applyDeepPartialProperty(metadata, key) {
            let resolvedType = metadata.type;
            if (typeof resolvedType === 'function' && resolvedType.length === 0) {
                try {
                    resolvedType = resolvedType();
                }
                catch (_a) {
                    resolvedType = metadata.type;
                }
            }
            let isArray = metadata.isArray === true;
            if (Array.isArray(resolvedType) && resolvedType.length === 1) {
                resolvedType = resolvedType[0];
                isArray = true;
            }
            const isNestedDto = isDtoClass(resolvedType);
            const nestedType = isNestedDto
                ? DeepPartialType(resolvedType, options)
                : metadata.type;
            const decoratorFactory = (0, decorators_1.ApiProperty)(Object.assign(Object.assign(Object.assign(Object.assign({}, metadata), { type: nestedType }), (isNestedDto ? { isArray } : {})), { required: false }));
            decoratorFactory(DeepPartialTypeClass.prototype, key);
        }
        fields.forEach((key) => {
            const metadata = Reflect.getMetadata(constants_1.DECORATORS.API_MODEL_PROPERTIES, classRef.prototype, key) || {};
            applyDeepPartialProperty(metadata, key);
            applyPartialDecoratorFn(DeepPartialTypeClass, key);
        });
        if (DeepPartialTypeClass[plugin_constants_1.METADATA_FACTORY_NAME]) {
            const pluginMetadata = DeepPartialTypeClass[plugin_constants_1.METADATA_FACTORY_NAME]();
            const pluginFields = Object.keys(pluginMetadata);
            pluginFields.forEach((key) => {
                if (!fields.includes(key)) {
                    applyDeepPartialProperty(pluginMetadata[key], key);
                }
                applyPartialDecoratorFn(DeepPartialTypeClass, key);
            });
        }
    }
    applyFields(fields);
    metadata_loader_1.MetadataLoader.addRefreshHook(() => {
        const fields = modelPropertiesAccessor.getModelProperties(classRef.prototype);
        applyFields(fields);
    });
    return DeepPartialTypeClass;
}
