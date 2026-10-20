"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeSafeInstanceDecorator = makeSafeInstanceDecorator;
const common_1 = require("@nestjs/common");
const logger = new common_1.Logger('InstrumentLogger');
/**
 * Wraps an `instrument.instanceDecorator` so that a decorator throwing on a
 * given instance (e.g. when inspecting a Proxy whose traps throw outside of
 * their intended context, such as `nestjs-cls` proxy providers) does not
 * crash the application bootstrap. The original, undecorated instance is
 * used instead and a warning is logged.
 */
function makeSafeInstanceDecorator(decorator) {
    return (target) => {
        try {
            return decorator(target);
        }
        catch (err) {
            logger.warn(`The "instanceDecorator" function threw an error while decorating an instance (${err?.message ?? err}). The undecorated instance will be used instead.`);
            return target;
        }
    };
}
