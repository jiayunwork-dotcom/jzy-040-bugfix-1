import { Module } from '@nestjs/common';
import { SpecsService } from './specs.service';
import { SpecSeeder } from './spec-seeder.service';

/** Named-spec registry (in-memory) plus startup seed. */
@Module({
  providers: [SpecsService, SpecSeeder],
  exports: [SpecsService, SpecSeeder],
})
export class SpecsModule {}
