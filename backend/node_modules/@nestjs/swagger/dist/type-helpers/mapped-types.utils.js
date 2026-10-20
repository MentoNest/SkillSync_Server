"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMappedTypeClassName = setMappedTypeClassName;
exports.clonePluginMetadataFactory = clonePluginMetadataFactory;
const lodash_1 = require("lodash");
const plugin_constants_1 = require("../plugin/plugin-constants");
function capitalizeFirstLetter(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function sanitizeTypeNameSegment(value) {
    return String(value).replace(/[^A-Za-z0-9_$]/g, '_');
}
function setMappedTypeClassName(target, prefix, classRef, keys = []) {
    const parentTypeName = classRef.name || 'Anonymous';
    const mappedProperties = keys
        .map((key) => capitalizeFirstLetter(sanitizeTypeNameSegment(key)))
        .join('');
    Object.defineProperty(target, 'name', {
        value: `${prefix}${parentTypeName}${mappedProperties}`
    });
}
function clonePluginMetadataFactory(target, parent, transformFn = lodash_1.identity) {
    let targetMetadata = {};
    do {
        if (!parent.constructor) {
            return;
        }
        if (!parent.constructor[plugin_constants_1.METADATA_FACTORY_NAME]) {
            continue;
        }
        const parentMetadata = parent.constructor[plugin_constants_1.METADATA_FACTORY_NAME]();
        targetMetadata = Object.assign(Object.assign({}, parentMetadata), targetMetadata);
    } while ((parent = Reflect.getPrototypeOf(parent)) &&
        parent !== Object.prototype &&
        parent);
    targetMetadata = transformFn(targetMetadata);
    if (target[plugin_constants_1.METADATA_FACTORY_NAME]) {
        const originalFactory = target[plugin_constants_1.METADATA_FACTORY_NAME];
        target[plugin_constants_1.METADATA_FACTORY_NAME] = () => {
            const originalMetadata = originalFactory();
            return Object.assign(Object.assign({}, originalMetadata), targetMetadata);
        };
    }
    else {
        target[plugin_constants_1.METADATA_FACTORY_NAME] = () => targetMetadata;
    }
}
