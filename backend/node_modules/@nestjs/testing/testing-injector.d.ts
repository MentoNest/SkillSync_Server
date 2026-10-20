import { NestContainer } from '@nestjs/core';
import { Injector, InjectorDependencyContext } from '@nestjs/core/injector/injector';
import { ContextId, InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Module } from '@nestjs/core/injector/module';
import { MockFactory } from './interfaces';
interface ResolutionContext {
    contextId: ContextId;
    inquirer?: InstanceWrapper;
    effectiveInquirerId?: string;
}
/**
 * @publicApi
 */
export declare class TestingInjector extends Injector {
    protected mocker?: MockFactory;
    protected container: NestContainer;
    setMocker(mocker: MockFactory): void;
    setContainer(container: NestContainer): void;
    resolveComponentWrapper<T>(moduleRef: Module, name: any, dependencyContext: InjectorDependencyContext, wrapper: InstanceWrapper<T>, resolutionContext?: ResolutionContext, keyOrIndex?: string | number): Promise<InstanceWrapper>;
    resolveComponentHost<T>(moduleRef: Module, instanceWrapper: InstanceWrapper<T>, resolutionContext?: ResolutionContext): Promise<InstanceWrapper>;
    private mockWrapper;
}
export {};
