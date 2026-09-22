import { Module } from '@nestjs/common';
import { KernelModule } from '../kernel/kernel.module';
import { SpecsModule } from '../specs/specs.module';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';
import { ParamsResolver } from './params.resolver';

@Module({
  imports: [KernelModule, SpecsModule],
  controllers: [FlowController],
  providers: [FlowService, ParamsResolver],
})
export class FlowModule {}
