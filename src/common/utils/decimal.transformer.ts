export const decimalTransformer = {
  to: (value: number | string | null) => {
    if (value === null || value === undefined) return null;
    return value;
  },
  from: (value: string | null) => {
    if (value === null || value === undefined) return null;
    return parseFloat(value);
  },
};
