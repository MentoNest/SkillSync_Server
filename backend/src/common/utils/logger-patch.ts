import { Logger } from '@nestjs/common';
import { getRequestId } from '../contexts/request-id.context';

const levels: Array<keyof Logger> = ['log', 'warn', 'error', 'debug', 'verbose'];

for (const level of levels) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const original = Logger.prototype[level] as Function;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  Logger.prototype[level] = function (...args: any[]) {
    try {
      const requestId = getRequestId();
      const message = args[0];
      const context = args[1];
      const entry = JSON.stringify({
        level: level === 'log' ? 'info' : level,
        timestamp: new Date().toISOString(),
        message,
        context,
        requestId,
      });

      if (process.env.NODE_ENV !== 'production') {
        // still call console for local readability
        const colors: Record<string, string> = { info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[36m', verbose: '\x1b[37m' };
        const reset = '\x1b[0m';
        // prefer console.log to preserve Nest behaviour
        // eslint-disable-next-line no-console
        console.log(`${colors[level === 'log' ? 'info' : level] || ''}${entry}${reset}`);
      } else {
        // structured JSON for aggregators
        // eslint-disable-next-line no-console
        process.stdout.write(entry + '\n');
      }
    } catch (e) {
      // swallow
    }

    try {
      return original.apply(this, args);
    } catch (e) {
      // ignore
    }
  };
}
