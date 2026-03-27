import { Module } from '@nestjs/common';
import { CsrfService } from './services/csrf.service';
import { CsrfGuard } from './guards/csrf.guard';

@Module({
  providers: [CsrfService, CsrfGuard],
  exports: [CsrfService, CsrfGuard],
})
export class CommonModule {}