import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { SpecsService } from './specs.service';

/**
 * Name of the demo operating point registered at startup: a thin capillary
 * with a high-viscosity fluid, sitting far inside the laminar regime
 * (Re ≈ 7.9·10⁻⁷ even at Δp = 1000 Pa), so it confirms laminar behavior
 * at a glance.
 */
export const DEMO_SPEC_NAME = 'demo-capillary';

@Injectable()
export class SpecSeeder implements OnApplicationBootstrap {
  constructor(private readonly specs: SpecsService) {}

  onApplicationBootstrap(): void {
    if (!this.specs.has(DEMO_SPEC_NAME)) {
      this.specs.register(DEMO_SPEC_NAME, {
        radius: 50e-6, // 50 μm
        length: 20e-3, // 20 mm
        viscosity: 1.0, // 1 Pa·s (≈ glycerin, strongly laminar)
        density: 1260, // kg/m³
      });
    }
  }
}
