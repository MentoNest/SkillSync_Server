"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayMetadataExplorer = void 0;
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
const constants_1 = require("./constants");
const ws_paramtype_enum_1 = require("./enums/ws-paramtype.enum");
const context_utils_1 = require("@nestjs/core/helpers/context-utils");
class GatewayMetadataExplorer {
    constructor(metadataScanner) {
        this.metadataScanner = metadataScanner;
        this.contextUtils = new context_utils_1.ContextUtils();
    }
    explore(instance) {
        const instancePrototype = Object.getPrototypeOf(instance);
        return this.metadataScanner
            .getAllMethodNames(instancePrototype)
            .map(method => this.exploreMethodMetadata(instancePrototype, method))
            .filter(metadata => metadata);
    }
    exploreMethodMetadata(instancePrototype, methodName) {
        const callback = instancePrototype[methodName];
        const isMessageMapping = Reflect.getMetadata(constants_1.MESSAGE_MAPPING_METADATA, callback);
        if ((0, shared_utils_1.isUndefined)(isMessageMapping)) {
            return null;
        }
        const message = Reflect.getMetadata(constants_1.MESSAGE_METADATA, callback);
        const isAckHandledManually = this.hasAckDecorator(instancePrototype, methodName);
        return {
            callback,
            message,
            methodName,
            isAckHandledManually,
        };
    }
    hasAckDecorator(instancePrototype, methodName) {
        const paramsMetadata = Reflect.getMetadata(constants_1.PARAM_ARGS_METADATA, instancePrototype.constructor, methodName);
        if (!paramsMetadata) {
            return false;
        }
        const metadataKeys = Object.keys(paramsMetadata);
        return metadataKeys.some(key => {
            const type = this.contextUtils.mapParamType(key);
            return Number(type) === ws_paramtype_enum_1.WsParamtype.ACK;
        });
    }
    *scanForServerHooks(instance) {
        for (const propertyKey in instance) {
            if ((0, shared_utils_1.isFunction)(instance[propertyKey])) {
                continue;
            }
            const property = String(propertyKey);
            const isServer = Reflect.getMetadata(constants_1.GATEWAY_SERVER_METADATA, instance, property);
            if (!(0, shared_utils_1.isUndefined)(isServer)) {
                yield property;
            }
        }
    }
}
exports.GatewayMetadataExplorer = GatewayMetadataExplorer;
