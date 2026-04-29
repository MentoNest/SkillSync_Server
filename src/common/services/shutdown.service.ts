import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '../../config/config.service';
import { HttpServer } from '@nestjs/common';

export interface ShutdownConfig {
  timeout: number; // milliseconds
}

@Injectable()
export class ShutdownService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShutdownService.name);
  private isShuttingDown = false;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private config: ShutdownConfig;
  private httpServer: HttpServer | null = null;

  constructor(
    @Optional() private dataSource: DataSource,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {
    this.config = {
      timeout: this.configService.shutdownTimeout || 30000, // Default 30 seconds
    };
  }

  async onModuleInit() {
    this.logger.log('Shutdown service initialized');
  }

  async onModuleDestroy() {
    if (this.isShuttingDown) {
      return;
    }
    await this.gracefulShutdown('Module destroy');
  }

  /**
   * Set the HTTP server reference for graceful shutdown
   */
  setHttpServer(server: HttpServer) {
    this.httpServer = server;
  }

  /**
   * Check if the application is currently shutting down
   */
  isShuttingDownState(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Initiate graceful shutdown
   */
  async gracefulShutdown(signal: string = 'SIGTERM') {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    this.logger.log(`═══════════════════════════════════════════`);
    this.logger.log(`🛑 Graceful shutdown initiated: ${signal}`);
    this.logger.log(`⏱️  Shutdown timeout: ${this.config.timeout}ms`);
    this.logger.log(`═══════════════════════════════════════════`);

    // Set force shutdown timeout
    this.shutdownTimeout = setTimeout(() => {
      this.logger.error('⚠️  Shutdown timeout reached - forcing exit');
      process.exit(1);
    }, this.config.timeout);

    try {
      // Step 1: Stop accepting new connections
      await this.stopAcceptingConnections();
      this.logProgress('HTTP server stopped accepting new connections', startTime);

      // Step 2: Close database connections
      await this.closeDatabaseConnections();
      this.logProgress('Database connections closed', startTime);

      // Step 3: Close Redis connections
      await this.closeRedisConnections();
      this.logProgress('Redis connections closed', startTime);

      // Step 4: Flush logs and cleanup
      await this.cleanup();
      this.logProgress('Cleanup completed', startTime);

      // Clear force shutdown timeout
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }

      const totalTime = Date.now() - startTime;
      this.logger.log(`✅ Graceful shutdown completed in ${totalTime}ms`);
      this.logger.log(`═══════════════════════════════════════════`);

      process.exit(0);
    } catch (error) {
      this.logger.error('❌ Error during graceful shutdown:', error instanceof Error ? error.stack : String(error));
      
      // Clear timeout and force exit
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }
      
      process.exit(1);
    }
  }

  /**
   * Stop accepting new HTTP connections
   */
  private async stopAcceptingConnections(): Promise<void> {
    if (this.httpServer) {
      try {
        // Close the HTTP server - returns a promise in modern NestJS
        await new Promise<void>((resolve, reject) => {
          const closeResult = this.httpServer?.close();
          
          // Handle both promise-based and callback-based close
          if (closeResult && typeof (closeResult as Promise<any>).then === 'function') {
            // Promise-based
            (closeResult as Promise<void>)
              .then(() => resolve())
              .catch(() => resolve()); // Resolve even on error to continue shutdown
          } else {
            // Assume success for callback-based or synchronous
            resolve();
          }
          
          // Safety timeout to prevent hanging
          setTimeout(() => {
            this.logger.warn('HTTP server close timeout - continuing shutdown');
            resolve();
          }, 5000);
        });
      } catch (error) {
        this.logger.warn('HTTP server close error - continuing shutdown');
      }
    }
  }

  /**
   * Close database connections gracefully
   */
  private async closeDatabaseConnections(): Promise<void> {
    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        this.logger.log('Closing database connections...');
        await this.dataSource.destroy();
        this.logger.log('Database connections closed successfully');
      }
    } catch (error) {
      this.logger.error('Error closing database connections:', error instanceof Error ? error.message : String(error));
      // Don't throw - continue shutdown even if DB close fails
    }
  }

  /**
   * Close Redis connections gracefully
   */
  private async closeRedisConnections(): Promise<void> {
    try {
      this.logger.log('Closing Redis connections...');
      // Check if client exists before calling quit
      const client = this.redisService.getClient();
      if (client) {
        await this.redisService.onModuleDestroy();
        this.logger.log('Redis connections closed successfully');
      } else {
        this.logger.log('Redis client not initialized, skipping');
      }
    } catch (error) {
      this.logger.error('Error closing Redis connections:', error instanceof Error ? error.message : String(error));
      // Don't throw - continue shutdown even if Redis close fails
    }
  }

  /**
   * Perform cleanup operations (flush logs, close file handles, etc.)
   */
  private async cleanup(): Promise<void> {
    this.logger.log('Performing cleanup operations...');
    
    // Add any additional cleanup here:
    // - Flush log buffers
    // - Close file handles
    // - Complete pending transactions
    // - Send shutdown notifications
    
    this.logger.log('Cleanup operations completed');
  }

  /**
   * Log shutdown progress with elapsed time
   */
  private logProgress(message: string, startTime: number): void {
    const elapsed = Date.now() - startTime;
    this.logger.log(`✓ ${message} (${elapsed}ms)`);
  }
}
