export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailContext {
  [key: string]: any;
}
