import * as ts from 'typescript';
export declare class TypeScriptBinaryLoader {
    private tsBinary?;
    load(): typeof ts;
    private assertProgrammaticApiIsSupported;
    getModulePaths(): string[];
}
