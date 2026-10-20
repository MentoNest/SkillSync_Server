import { DynamicModule } from '@nestjs/common';
import { ScheduleModuleOptions } from './interfaces/schedule-module-options.interface';
export declare class ScheduleModule {
    static forRoot(options?: ScheduleModuleOptions): DynamicModule;
}
