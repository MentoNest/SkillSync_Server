import { Module, Global } from '@nestjs/common';
import { ContractTestingService } from './contract-testing.service';

@Global()
@Module({
  providers: [ContractTestingService],
  exports: [ContractTestingService],
})
export class ContractTestingModule {}
