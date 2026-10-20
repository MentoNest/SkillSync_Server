import * as ts from 'typescript';
import { Configuration } from '../../configuration';
export declare function deleteOutDirIfEnabled(configuration: Required<Configuration>, appName: string | undefined, dirPath: string, tsOptions?: ts.CompilerOptions): Promise<void>;
