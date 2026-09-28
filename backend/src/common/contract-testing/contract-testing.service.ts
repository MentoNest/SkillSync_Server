import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ContractTestConfig {
  specPath: string;
  outputPath: string;
  breakingChangeDetection: boolean;
  versionHeader: string;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  endpoint: string;
  method: string;
}

export interface BreakingChange {
  type: 'removed_field' | 'type_change' | 'required_added' | 'endpoint_removed' | 'status_code_change';
  endpoint: string;
  field?: string;
  description: string;
  severity: 'breaking' | 'warning';
}

@Injectable()
export class ContractTestingService {
  private readonly logger = new Logger(ContractTestingService.name);
  private readonly config: ContractTestConfig;
  private spec: any = null;

  constructor() {
    this.config = {
      specPath: process.env.OPENAPI_SPEC_PATH || './docs/openapi.yaml',
      outputPath: process.env.CONTRACT_TEST_OUTPUT || './test/contracts',
      breakingChangeDetection: process.env.BREAKING_CHANGE_DETECTION !== 'false',
      versionHeader: 'X-API-Version',
    };
  }

  /**
   * Load OpenAPI specification
   */
  async loadSpec(): Promise<any> {
    try {
      const specContent = fs.readFileSync(this.config.specPath, 'utf8');
      this.spec = yaml.load(specContent);
      this.logger.log('OpenAPI specification loaded successfully');
      return this.spec;
    } catch (error) {
      this.logger.warn('OpenAPI specification not found, generating from code');
      return this.generateSpecFromCode();
    }
  }

  /**
   * Generate OpenAPI spec from NestJS decorators
   */
  async generateSpecFromCode(): Promise<any> {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'SkillSync API',
        version: '1.0.0',
        description: 'SkillSync Backend API Documentation',
      },
      servers: [
        {
          url: process.env.API_BASE_URL || 'http://localhost:3000',
          description: 'Development server',
        },
      ],
      paths: {} as Record<string, any>,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              displayName: { type: 'string' },
              profileType: { type: 'string', enum: ['mentor', 'mentee', 'both', 'admin'] },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          AuthResponse: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              tokenType: { type: 'string' },
              expiresIn: { type: 'number' },
            },
          },
          Error: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              message: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
      },
    };

    // Save generated spec
    const outputDir = path.dirname(this.config.specPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(this.config.specPath, yaml.dump(spec));
    this.logger.log('OpenAPI specification generated');

    return spec;
  }

  /**
   * Validate API response against spec
   */
  validateResponse(
    endpoint: string,
    method: string,
    statusCode: number,
    response: any,
  ): ContractValidationResult {
    const result: ContractValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      endpoint,
      method,
    };

    if (!this.spec) {
      result.warnings.push('No OpenAPI spec loaded');
      return result;
    }

    const pathObj = this.spec.paths[endpoint];
    if (!pathObj) {
      result.errors.push(`Endpoint ${endpoint} not found in spec`);
      result.valid = false;
      return result;
    }

    const methodObj = pathObj[method.toLowerCase()];
    if (!methodObj) {
      result.errors.push(`Method ${method} not found for ${endpoint}`);
      result.valid = false;
      return result;
    }

    const responseObj = methodObj.responses[statusCode.toString()];
    if (!responseObj) {
      result.warnings.push(`Status code ${statusCode} not documented`);
      return result;
    }

    // Validate response schema if defined
    if (responseObj.content?.['application/json']?.schema) {
      const schema = responseObj.content['application/json'].schema;
      const validation = this.validateSchema(response, schema);
      result.errors.push(...validation.errors);
      result.warnings.push(...validation.warnings);
      if (validation.errors.length > 0) {
        result.valid = false;
      }
    }

    return result;
  }

  /**
   * Validate response against JSON schema
   */
  private validateSchema(
    data: any,
    schema: any,
    path: string = '',
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (schema.type === 'object' && schema.properties) {
      if (typeof data !== 'object' || data === null) {
        errors.push(`${path}: Expected object, got ${typeof data}`);
        return { errors, warnings };
      }

      // Check required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in data)) {
            errors.push(`${path}.${field}: Required field missing`);
          }
        }
      }

      // Validate each property
      for (const [key, propSchema] of Object.entries(schema.properties) as [string, any][]) {
        if (key in data) {
          const propValidation = this.validateSchema(data[key], propSchema, `${path}.${key}`);
          errors.push(...propValidation.errors);
          warnings.push(...propValidation.warnings);
        }
      }
    } else if (schema.type === 'array' && schema.items) {
      if (!Array.isArray(data)) {
        errors.push(`${path}: Expected array, got ${typeof data}`);
        return { errors, warnings };
      }

      data.forEach((item, index) => {
        const itemValidation = this.validateSchema(item, schema.items, `${path}[${index}]`);
        errors.push(...itemValidation.errors);
        warnings.push(...itemValidation.warnings);
      });
    }

    return { errors, warnings };
  }

  /**
   * Detect breaking changes between spec versions
   */
  detectBreakingChanges(
    oldSpec: any,
    newSpec: any,
  ): BreakingChange[] {
    const changes: BreakingChange[] = [];

    if (!this.config.breakingChangeDetection) {
      return changes;
    }

    // Check for removed endpoints
    for (const endpoint of Object.keys(oldSpec.paths || {})) {
      if (!(endpoint in (newSpec.paths || {}))) {
        changes.push({
          type: 'endpoint_removed',
          endpoint,
          description: `Endpoint ${endpoint} was removed`,
          severity: 'breaking',
        });
      }
    }

    // Check for removed fields and type changes
    for (const endpoint of Object.keys(oldSpec.paths || {})) {
      const newPath = newSpec.paths?.[endpoint];
      if (!newPath) continue;

      for (const method of Object.keys(oldSpec.paths[endpoint])) {
        const oldResponse = oldSpec.paths[endpoint][method]?.responses?.['200'];
        const newResponse = newPath[method]?.responses?.['200'];

        if (!oldResponse || !newResponse) continue;

        const oldSchema = oldResponse.content?.['application/json']?.schema;
        const newSchema = newResponse.content?.['application/json']?.schema;

        if (oldSchema && newSchema) {
          const fieldChanges = this.compareSchemas(oldSchema, newSchema, endpoint);
          changes.push(...fieldChanges);
        }
      }
    }

    return changes;
  }

  /**
   * Compare two schemas for breaking changes
   */
  private compareSchemas(
    oldSchema: any,
    newSchema: any,
    endpoint: string,
    path: string = '',
  ): BreakingChange[] {
    const changes: BreakingChange[] = [];

    if (oldSchema.type === 'object' && newSchema.type === 'object') {
      // Check for removed fields
      for (const field of Object.keys(oldSchema.properties || {})) {
        if (!(field in (newSchema.properties || {}))) {
          changes.push({
            type: 'removed_field',
            endpoint,
            field,
            description: `Field ${field} was removed from ${endpoint}`,
            severity: 'breaking',
          });
        }
      }

      // Check for new required fields
      const newRequired = newSchema.required || [];
      const oldRequired = oldSchema.required || [];
      for (const field of newRequired) {
        if (!oldRequired.includes(field)) {
          changes.push({
            type: 'required_added',
            endpoint,
            field,
            description: `Field ${field} is now required in ${endpoint}`,
            severity: 'breaking',
          });
        }
      }

      // Check for type changes
      for (const [field, oldProp] of Object.entries(oldSchema.properties || {}) as [string, any][]) {
        const newProp = newSchema.properties?.[field];
        if (newProp && oldProp.type !== newProp.type) {
          changes.push({
            type: 'type_change',
            endpoint,
            field,
            description: `Field ${field} type changed from ${oldProp.type} to ${newProp.type} in ${endpoint}`,
            severity: 'breaking',
          });
        }
      }
    }

    return changes;
  }

  /**
   * Generate contract tests for an endpoint
   */
  generateContractTest(
    endpoint: string,
    method: string,
    expectedStatus: number,
    responseSchema: any,
  ): string {
    const testName = `contract_${method}_${endpoint.replace(/\//g, '_')}`;

    return `
describe('${testName}', () => {
  it('should return ${expectedStatus} with valid response schema', async () => {
    const response = await request(app.getHttpServer())
      .${method.toLowerCase()}('${endpoint}')
      .set('Authorization', 'Bearer \${token}')
      .expect(${expectedStatus});

    // Validate response schema
    const schema = ${JSON.stringify(responseSchema, null, 2)};
    const result = validateResponse(response.body, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return proper error format for invalid request', async () => {
    const response = await request(app.getHttpServer())
      .${method.toLowerCase()}('${endpoint}')
      .expect(400);

    expect(response.body).toHaveProperty('statusCode');
    expect(response.body).toHaveProperty('message');
  });
});
`;
  }

  /**
   * Generate API client from OpenAPI spec
   */
  async generateApiClient(outputDir: string): Promise<void> {
    if (!this.spec) {
      await this.loadSpec();
    }

    const clientCode = this.generateClientCode();
    const clientPath = path.join(outputDir, 'api-client.ts');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(clientPath, clientCode);
    this.logger.log(`API client generated at ${clientPath}`);
  }

  /**
   * Generate TypeScript client code
   */
  private generateClientCode(): string {
    const interfaces = this.generateInterfaces();
    const methods = this.generateClientMethods();

    return `
// Auto-generated API client from OpenAPI specification
// Do not edit manually

${interfaces}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = '${process.env.API_BASE_URL || 'http://localhost:3000'}') {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = \`Bearer \${this.token}\`;
    }

    const response = await fetch(\`\${this.baseUrl}\${path}\`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json();
  }

${methods}
}
`;
  }

  /**
   * Generate TypeScript interfaces from spec
   */
  private generateInterfaces(): string {
    if (!this.spec?.components?.schemas) return '';

    return Object.entries(this.spec.components.schemas)
      .map(([name, schema]: [string, any]) => {
        const properties = schema.properties || {};
        const lines = Object.entries(properties).map(([prop, propSchema]: [string, any]) => {
          const type = this.mapToJsonType(propSchema.type, propSchema.format);
          const optional = !(schema.required || []).includes(prop);
          return `  ${prop}${optional ? '?' : ''}: ${type};`;
        });

        return `export interface ${name} {\n${lines.join('\n')}\n}`;
      })
      .join('\n\n');
  }

  /**
   * Generate client methods
   */
  private generateClientMethods(): string {
    if (!this.spec?.paths) return '';

    const methods: string[] = [];

    for (const [endpoint, pathObj] of Object.entries(this.spec.paths) as [string, any][]) {
      for (const [method, operation] of Object.entries(pathObj) as [string, any][]) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const operationId = operation.operationId || `${method}_${endpoint}`;
          const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema;
          const returnType = responseSchema ? this.getSchemaName(responseSchema) : 'void';

          const params = endpoint.match(/\{(\w+)\}/g) || [];
          const paramArgs = params.map((p: string) => `${p.slice(1, -1)}: string`).join(', ');
          const paramArgsStr = paramArgs ? `, ${paramArgs}` : '';

          const hasBody = ['post', 'put', 'patch'].includes(method);
          const bodyArg = hasBody ? 'body: any' : '';
          const allArgs = [paramArgsStr, bodyArg].filter(Boolean).join(', ');

          methods.push(`
  async ${operationId}(${allArgs.trim()}): Promise<${returnType}> {
    let path = '${endpoint}';
${params.map((p: string) => `    path = path.replace('${p}', ${p.slice(1, -1)});`).join('\n')}
    return this.request<${returnType}>('${method.toUpperCase()}'${hasBody ? ', path, body' : ', path'});
  }`);
        }
      }
    }

    return methods.join('\n');
  }

  private mapToJsonType(type: string, format?: string): string {
    if (type === 'string') return format === 'date-time' ? 'Date' : 'string';
    if (type === 'number') return 'number';
    if (type === 'integer') return 'number';
    if (type === 'boolean') return 'boolean';
    if (type === 'array') return 'any[]';
    return 'any';
  }

  private getSchemaName(schema: any): string {
    if (schema.$ref) {
      const parts = schema.$ref.split('/');
      return parts[parts.length - 1];
    }
    if (schema.type === 'array' && schema.items?.$ref) {
      return `${this.getSchemaName(schema.items)}[]`;
    }
    return 'any';
  }
}
