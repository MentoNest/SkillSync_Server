import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailTemplateService {
  render(templateName: string, data: Record<string, any>): string {
    const filePath = path.join(
      __dirname,
      'templates',
      `${templateName}.hbs`,
    );

    const source = fs.readFileSync(filePath, 'utf8');
    const template = Handlebars.compile(source);

    return template(data);
  }
}
