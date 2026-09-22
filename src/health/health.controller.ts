import { Controller, Get } from '@nestjs/common';
import { LAMINAR_REYNOLDS_LIMIT } from '../kernel/reynolds.service';

/** Liveness/readiness-style status endpoint for monitoring. */
@Controller({ version: '1' })
export class HealthController {
  private readonly startedAt = new Date().toISOString();

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'poiseuille-service',
      model: 'Hagen-Poiseuille (circular straight pipe, steady laminar, Newtonian, incompressible)',
      laminarReynoldsLimit: LAMINAR_REYNOLDS_LIMIT,
      startedAt: this.startedAt,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
