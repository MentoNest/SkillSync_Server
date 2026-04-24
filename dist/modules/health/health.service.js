"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var HealthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../redis/redis.service");
const typeorm_1 = require("typeorm");
let HealthService = HealthService_1 = class HealthService {
    constructor(configService, redisService, dataSource) {
        this.configService = configService;
        this.redisService = redisService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(HealthService_1.name);
    }
    check() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: this.configService.get('NODE_ENV'),
        };
    }
    async checkDetailed() {
        const redisHealth = await this.checkRedis();
        const databaseHealth = await this.checkDatabase();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: this.configService.get('NODE_ENV'),
            version: process.env.npm_package_version || '1.0.0',
            memory: process.memoryUsage(),
            system: {
                platform: process.platform,
                nodeVersion: process.version,
            },
            services: {
                database: databaseHealth,
                redis: redisHealth,
            },
        };
    }
    async checkRedis() {
        try {
            const health = await this.redisService.ping();
            return health;
        }
        catch (error) {
            this.logger.error('Redis health check failed', error.stack);
            return {
                status: 'unhealthy',
                responseTime: '0ms',
                error: error.message,
            };
        }
    }
    async checkDatabase() {
        const startTime = Date.now();
        try {
            await this.dataSource.query('SELECT 1');
            const responseTime = Date.now() - startTime;
            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
                connections: {
                    master: this.dataSource.isInitialized ? 'connected' : 'disconnected',
                },
            };
        }
        catch (error) {
            this.logger.error('Database health check failed', error.stack);
            return {
                status: 'unhealthy',
                responseTime: `${Date.now() - startTime}ms`,
                error: error.message,
            };
        }
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = HealthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_service_1.RedisService,
        typeorm_1.DataSource])
], HealthService);
//# sourceMappingURL=health.service.js.map