"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsParamsFactory = void 0;
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
const ws_paramtype_enum_1 = require("../enums/ws-paramtype.enum");
class WsParamsFactory {
    exchangeKeyForValue(type, data, args) {
        if (!args) {
            return null;
        }
        switch (type) {
            case ws_paramtype_enum_1.WsParamtype.SOCKET:
                return args[0];
            case ws_paramtype_enum_1.WsParamtype.PAYLOAD:
                return data ? args[1]?.[data] : args[1];
            case ws_paramtype_enum_1.WsParamtype.ACK: {
                return args.find(arg => (0, shared_utils_1.isFunction)(arg));
            }
            default:
                return null;
        }
    }
}
exports.WsParamsFactory = WsParamsFactory;
