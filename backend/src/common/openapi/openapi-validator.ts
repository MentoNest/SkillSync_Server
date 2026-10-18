/**
 * Minimal OpenAPI/JSON-schema validator used by contract tests to check that
 * a response body matches the documented schema (issue #1484). It supports
 * $ref, type, enum, nullable, properties/required and array items - the
 * constructs @nestjs/swagger emits.
 */
type Json = Record<string, any>;

function resolve(doc: Json, schema: Json, depth = 0): Json {
  if (depth > 10 || typeof schema?.$ref !== 'string') return schema;
  const target = schema.$ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<any>((node: any, key: string) => node?.[key], doc);
  return resolve(doc, target ?? {}, depth + 1);
}

export function validateAgainstSchema(
  doc: Json,
  schemaInput: Json,
  value: unknown,
  path = '$',
): string[] {
  const schema = resolve(doc, schemaInput ?? {});
  const errors: string[] = [];

  if (value === null || value === undefined) {
    if (schema.nullable || value === undefined) return errors;
    return [`${path}: expected ${schema.type ?? 'value'}, got null`];
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string`);
      break;
    case 'number':
    case 'integer':
      if (typeof value !== 'number') errors.push(`${path}: expected ${schema.type}`);
      else if (schema.type === 'integer' && !Number.isInteger(value)) {
        errors.push(`${path}: expected integer`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
      break;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array`);
      } else if (schema.items) {
        value.forEach((item, i) =>
          errors.push(...validateAgainstSchema(doc, schema.items, item, `${path}[${i}]`)),
        );
      }
      break;
    case 'object':
    default:
      if (schema.properties || schema.type === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`${path}: expected object`);
          break;
        }
        const obj = value as Record<string, unknown>;
        for (const name of schema.required ?? []) {
          if (!(name in obj)) errors.push(`${path}.${name}: required property is missing`);
        }
        for (const [name, propSchema] of Object.entries<Json>(schema.properties ?? {})) {
          if (name in obj) {
            errors.push(...validateAgainstSchema(doc, propSchema, obj[name], `${path}.${name}`));
          }
        }
      }
  }
  return errors;
}

/** Looks up the JSON response schema for an operation and status code. */
export function responseSchemaFor(
  doc: Json,
  path: string,
  method: string,
  status: string | number,
): Json | undefined {
  return doc?.paths?.[path]?.[method.toLowerCase()]?.responses?.[String(status)]?.content?.[
    'application/json'
  ]?.schema;
}
