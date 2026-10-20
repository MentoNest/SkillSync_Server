"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ack = Ack;
const ws_paramtype_enum_1 = require("../enums/ws-paramtype.enum");
const param_utils_1 = require("../utils/param.utils");
/**
 * WebSockets `ack` parameter decorator.
 * Extracts the `ack` callback function from the arguments of a ws event.
 *
 * This decorator signals to the framework that the `ack` callback will be
 * handled manually within the method, preventing the framework from
 * automatically sending an acknowledgement based on the return value.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('events')
 * onEvent(
 *   @MessageBody() data: string,
 *   @Ack() ack: (response: any) => void
 * ) {
 *   // Manually call the ack callback
 *   ack({ status: 'ok' });
 * }
 * ```
 *
 * @publicApi
 */
function Ack() {
    return (0, param_utils_1.createPipesWsParamDecorator)(ws_paramtype_enum_1.WsParamtype.ACK)();
}
