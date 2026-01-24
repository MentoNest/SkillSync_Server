import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple template renderer using string interpolation
 * Supports variables in {{variableName}} format
 * Also supports conditional blocks: {{#if variable}} ... {{/if}}
 */
@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);
  private readonly templateDir = path.join(__dirname, 'templates');

  /**
   * Load and render a template with variables
   * @param templateName - Template filename (with extension)
   * @param variables - Key-value pairs to interpolate
   * @returns Rendered template string
   */
  renderTemplate(templateName: string, variables: Record<string, any>): string {
    try {
      const templatePath = path.join(this.templateDir, templateName);

      // Verify template exists
      if (!fs.existsSync(templatePath)) {
        throw new NotFoundException(`Template not found: ${templateName}`);
      }

      let template = fs.readFileSync(templatePath, 'utf-8');

      // Handle conditional blocks: {{#if variable}}...{{/if}}
      template = this.processConditionals(template, variables);

      // Handle simple variable interpolation: {{variableName}}
      template = this.interpolateVariables(template, variables);

      return template;
    } catch (error) {
      this.logger.error(`Failed to render template ${templateName}:`, error);
      throw error;
    }
  }

  /**
   * Process conditional blocks
   * Removes {{#if condition}}...{{/if}} blocks if condition is falsy
   */
  private processConditionals(template: string, variables: Record<string, any>): string {
    // Match {{#if variableName}}...{{/if}}
    const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

    return template.replace(conditionalRegex, (match, variable, content) => {
      return variables[variable] ? content : '';
    });
  }

  /**
   * Interpolate variables in template
   * Replaces {{variableName}} with variable values
   */
  private interpolateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      const value = variables[variable];
      if (value === undefined || value === null) {
        this.logger.warn(`Variable '${variable}' not provided, leaving as-is`);
        return match;
      }
      return String(value);
    });
  }

  /**
   * Get list of available templates
   */
  getAvailableTemplates(): string[] {
    try {
      return fs.readdirSync(this.templateDir).filter((file) => !file.startsWith('.'));
    } catch (error) {
      this.logger.error('Failed to list templates:', error);
      return [];
    }
  }
}
