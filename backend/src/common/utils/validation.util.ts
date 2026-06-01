import { ValidationError } from 'class-validator';

export interface ValidationFieldError {
  field: string;
  errors: string[];
}

export function formatValidationErrors(
  validationErrors: ValidationError[],
  parentPath = '',
): ValidationFieldError[] {
  return validationErrors.flatMap((error) => {
    const fieldName = parentPath ? `${parentPath}.${error.property}` : error.property;
    const constraints = error.constraints ? Object.values(error.constraints) : [];
    const children = error.children?.length
      ? formatValidationErrors(error.children, fieldName)
      : [];

    const current =
      constraints.length > 0
        ? [{ field: fieldName, errors: constraints }]
        : [];

    return [...current, ...children];
  });
}
