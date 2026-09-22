import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { FlowService } from './flow.service';
import { ForwardDto, InverseDto } from './dto/calc.dto';
import { FlowScanDto, RadiusScanDto } from './dto/scan.dto';

/**
 * Calculation endpoints. Single points and sweeps run through the same
 * {@link FlowService} → kernel path.
 */
@Controller({ version: '1' })
export class FlowController {
  constructor(private readonly flow: FlowService) {}

  /** Forward: Δp → Q, v̄, v_max, Re, τ_w. */
  @Post('flow/forward')
  @HttpCode(200)
  forward(@Body() dto: ForwardDto) {
    return this.flow.forward(dto);
  }

  /** Inverse: target Q → required Δp (Re-gated, exact round-trip). */
  @Post('flow/inverse')
  @HttpCode(200)
  inverse(@Body() dto: InverseDto) {
    return this.flow.inverse(dto);
  }

  /** Batch forward sweep over a list of radii. */
  @Post('flow/scan/radius')
  @HttpCode(200)
  radiusScan(@Body() dto: RadiusScanDto) {
    return this.flow.radiusScan(dto);
  }

  /** Batch inverse sweep over a list of target flow rates. */
  @Post('flow/scan/flow')
  @HttpCode(200)
  flowScan(@Body() dto: FlowScanDto) {
    return this.flow.flowScan(dto);
  }
}
