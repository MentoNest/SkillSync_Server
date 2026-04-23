import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * Structured logger instance using Pino for high-performance JSON logging.
 */
const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    base: {
        service: 'skillsync-server',
        env: process.env.NODE_ENV || 'development',
    },
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
    // Redact sensitive data (passwords, tokens, etc.)
    redact: {
        paths: [
            'headers.authorization',
            'headers.cookie',
            'headers["x-api-key"]',
            'body.password',
            'body.token',
            'body.accessToken',
            'body.refreshToken',
            'body.currentPassword',
            'body.newPassword',
            'body.oldPassword',
        ],
        remove: true,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        const { method, path, ip } = req;
        const userAgent = req.get('user-agent') || '';
        const requestId = (req.headers['x-request-id'] as string) || uuidv4();
        const startTime = process.hrtime();

        // Attach request ID for traceability
        req.headers['x-request-id'] = requestId;
        res.setHeader('X-Request-Id', requestId);

        res.on('finish', () => {
            const { statusCode } = res;
            const hrendTime = process.hrtime(startTime);
            const durationMs = (hrendTime[0] * 1000 + hrendTime[1] / 1000000).toFixed(3);

            const logData: any = {
                requestId,
                method,
                path,
                statusCode,
                duration: `${durationMs}ms`,
                ip,
                userAgent,
                headers: req.headers,
                body: req.body,
            };

            // Determine log level based on status code
            let level: pino.Level = 'info';
            if (statusCode >= 500) {
                level = 'error';
            } else if (statusCode >= 400) {
                level = 'warn';
            }

            const message = `${method} ${path} ${statusCode} - ${durationMs}ms`;

            // Log errors with stack traces in development only
            if (level === 'error') {
                const error = (req as any).rawError; // We can attach the raw error object in the exception filter
                if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
                    logData.stack = error.stack;
                }
                logger.error(logData, message);
            } else if (level === 'warn') {
                logger.warn(logData, message);
            } else {
                logger.info(logData, message);
            }
        });

        next();
    }
}
