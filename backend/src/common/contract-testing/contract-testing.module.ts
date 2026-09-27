import { Module, Global } from '@nestjs/common';
import { ContractTestingService } from './contract-testing.service.js';

@Global()
@Module({
  providers: [ContractTestingService],
  exports: [ContractTestingService],
})
export class ContractTestingModule {}
