export class Role {
  id!: string;
  name!: string;
  description!: string | null;
  createdAt!: Date;
  users!: unknown[];
}
