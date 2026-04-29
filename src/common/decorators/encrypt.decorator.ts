/**
 * Decorator to mark entity fields for encryption
 * Use this decorator on columns that should be encrypted before storage
 */
export function Encrypt(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    // Store metadata for the subscriber to use
    const existingFields = Reflect.getMetadata('encrypt:fields', target.constructor) || [];
    Reflect.defineMetadata('encrypt:fields', [...existingFields, propertyKey], target.constructor);
  };
}

/**
 * Decorator to mark entity fields for deterministic hash indexing
 * Use this on fields that need to be searchable (e.g., email)
 * Creates a separate hash column for exact match queries
 */
export function EncryptAndHash(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    // Store metadata for encryption
    const existingFields = Reflect.getMetadata('encrypt:fields', target.constructor) || [];
    Reflect.defineMetadata('encrypt:fields', [...existingFields, propertyKey], target.constructor);
    
    // Store metadata for hashing
    const existingHashFields = Reflect.getMetadata('encrypt:hashFields', target.constructor) || [];
    Reflect.defineMetadata('encrypt:hashFields', [...existingHashFields, propertyKey], target.constructor);
  };
}

/**
 * Helper to get encrypted fields from an entity class
 */
export function getEncryptFields(entityClass: any): string[] {
  return Reflect.getMetadata('encrypt:fields', entityClass) || [];
}

/**
 * Helper to get hash fields from an entity class
 */
export function getHashFields(entityClass: any): string[] {
  return Reflect.getMetadata('encrypt:hashFields', entityClass) || [];
}
