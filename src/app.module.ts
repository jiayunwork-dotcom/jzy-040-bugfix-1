import { Module } from '@nestjs/common';
import { KernelModule } from './kernel/kernel.module';
import { SpecsModule } from './specs/specs.module';
import { SpecsController } from './specs/specs.controller';
import { FlowModule } from './flow/flow.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [KernelModule, SpecsModule, FlowModule, HealthModule],
  controllers: [SpecsController],
})
export class AppModule {}
