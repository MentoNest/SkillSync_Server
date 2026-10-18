/**
 * Breaking-change detection between two OpenAPI 3 documents (issue #1484).
 *
 * A change is breaking when an existing client could stop working:
 *  - an endpoint (path + method) is removed;
 *  - a new required parameter is added;
 *  - a success response status code or a response property is removed;
 *  - a new required request-body property is added.
 * Adding endpoints, optional parameters or response properties is allowed.
 */
type Json = Record<string, any>;

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];

function resolveRef(doc: Json, schema: Json | undefined, depth = 0): Json | undefined {
  if (!schema || depth > 10) return schema;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    const target = schema.$ref
      .slice(2)
      .split('/')
      .reduce<any>((node, key) => node?.[key], doc);
    return resolveRef(doc, target, depth + 1);
  }
  return schema;
}

function responseSchema(doc: Json, operation: Json, status: string): Json | undefined {
  const content = operation?.responses?.[status]?.content?.['application/json'];
  return resolveRef(doc, content?.schema);
}

function requestSchema(doc: Json, operation: Json): Json | undefined {
  const content = operation?.requestBody?.content?.['application/json'];
  return resolveRef(doc, content?.schema);
}

function paramKey(p: Json): string {
  return `${p.in}:${p.name}`;
}

function compareResponseProps(
  baseDoc: Json,
  headDoc: Json,
  base: Json | undefined,
  head: Json | undefined,
  where: string,
  out: string[],
  depth = 0,
): void {
  if (!base?.properties || depth > 4) return;
  const headProps = head?.properties ?? {};
  for (const [name, baseProp] of Object.entries<Json>(base.properties)) {
    if (!(name in headProps)) {
      out.push(`${where}: response property "${name}" was removed`);
      continue;
    }
    compareResponseProps(
      baseDoc,
      headDoc,
      resolveRef(baseDoc, baseProp),
      resolveRef(headDoc, headProps[name]),
      `${where}.${name}`,
      out,
      depth + 1,
    );
  }
}

export function findBreakingChanges(base: Json, head: Json): string[] {
  const out: string[] = [];
  const basePaths: Json = base.paths ?? {};
  const headPaths: Json = head.paths ?? {};

  for (const [path, baseItem] of Object.entries<Json>(basePaths)) {
    const headItem = headPaths[path];
    for (const method of METHODS) {
      const baseOp = baseItem?.[method];
      if (!baseOp) continue;
      const label = `${method.toUpperCase()} ${path}`;
      const headOp = headItem?.[method];
      if (!headOp) {
        out.push(`${label}: endpoint was removed`);
        continue;
      }

      const baseParams = new Set<string>(
        [...(baseItem.parameters ?? []), ...(baseOp.parameters ?? [])].map(paramKey),
      );
      for (const p of [...(headItem.parameters ?? []), ...(headOp.parameters ?? [])]) {
        if (p.required && !baseParams.has(paramKey(p))) {
          out.push(`${label}: new required ${p.in} parameter "${p.name}"`);
        }
      }

      for (const status of Object.keys(baseOp.responses ?? {})) {
        if (!status.startsWith('2')) continue;
        if (!headOp.responses?.[status]) {
          out.push(`${label}: ${status} response was removed`);
          continue;
        }
        compareResponseProps(
          base,
          head,
          responseSchema(base, baseOp, status),
          responseSchema(head, headOp, status),
          `${label} ${status}`,
          out,
        );
      }

      const baseReq = requestSchema(base, baseOp);
      const headReq = requestSchema(head, headOp);
      const baseRequired = new Set<string>(baseReq?.required ?? []);
      for (const name of headReq?.required ?? []) {
        if (!baseRequired.has(name)) {
          out.push(`${label}: request property "${name}" is now required`);
        }
      }
    }
  }
  return out;
}
