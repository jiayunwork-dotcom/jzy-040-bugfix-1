import { Module } from '@nestjs/common';
import { ReynoldsService } from './reynolds.service';
import { ShearService } from './shear.service';
import { PoiseuilleService } from './poiseuille.service';
import { InverseService } from './inverse.service';

/**
 * Pure physics kernel: Hagen-Poiseuille forward/inverse evaluation,
 * Reynolds gating and wall shear stress. Holds no state.
 */
@Module({
  providers: [ReynoldsService, ShearService, PoiseuilleService, InverseService],
  exports: [ReynoldsService, ShearService, PoiseuilleService, InverseService],
})
export class KernelModule {}
