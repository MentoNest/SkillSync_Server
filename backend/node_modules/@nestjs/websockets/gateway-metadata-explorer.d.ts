import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { Observable } from 'rxjs';
import { NestGateway } from './interfaces/nest-gateway.interface';
export interface MessageMappingProperties {
    message: any;
    methodName: string;
    callback: (...args: any[]) => Observable<any> | Promise<any>;
    isAckHandledManually: boolean;
}
export declare class GatewayMetadataExplorer {
    private readonly metadataScanner;
    private readonly contextUtils;
    constructor(metadataScanner: MetadataScanner);
    explore(instance: NestGateway): MessageMappingProperties[];
    exploreMethodMetadata(instancePrototype: object, methodName: string): MessageMappingProperties | null;
    private hasAckDecorator;
    scanForServerHooks(instance: NestGateway): IterableIterator<string>;
}
