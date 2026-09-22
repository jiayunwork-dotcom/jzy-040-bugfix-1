import { Injectable } from '@nestjs/common';
import {
  ForwardResult,
  InverseResult,
  PhysicsParams,
} from '../kernel/types';
import { PoiseuilleService } from '../kernel/poiseuille.service';
import { InverseService } from '../kernel/inverse.service';
import { FlowException } from '../kernel/flow.exception';
import { ErrorCode } from '../kernel/error-codes';
import { FlowScanDto, RadiusScanDto } from './dto/scan.dto';
import { ForwardDto, InverseDto } from './dto/calc.dto';
import { ParamsResolver } from './params.resolver';

/** One successfully evaluated scan point. */
export interface ScanOk<TInput> {
  index: number;
  status: 'ok';
  input: TInput;
  result: ForwardResult | InverseResult;
}

/** One scan point rejected by validation or the Reynolds gate. */
export interface ScanError<TInput> {
  index: number;
  status: 'error';
  input: TInput;
  error: { code: ErrorCode; message: string; details?: unknown };
}

export type ScanPoint<TInput> = ScanOk<TInput> | ScanError<TInput>;

export interface ScanResponse<TInput> {
  sweep: 'radius' | 'targetFlowRate';
  count: number;
  okCount: number;
  errorCount: number;
  results: Array<ScanPoint<TInput>>;
}

/**
 * Application orchestration: resolves named specs / inline params and drives
 * the single physics kernel for single points and scans alike.
 */
@Injectable()
export class FlowService {
  constructor(
    private readonly resolver: ParamsResolver,
    private readonly poiseuille: PoiseuilleService,
    private readonly inverseSolver: InverseService,
  ) {}

  forward(dto: ForwardDto): ForwardResult {
    const params = this.resolver.resolve(dto);
    return this.poiseuille.evaluate({ ...params, pressureDrop: dto.pressureDrop });
  }

  inverse(dto: InverseDto): InverseResult {
    const params = this.resolver.resolve(dto);
    return this.inverseSolver.solve({
      ...params,
      targetFlowRate: dto.targetFlowRate,
    });
  }

  radiusScan(dto: RadiusScanDto): ScanResponse<{ radius: number }> {
    const params = this.resolver.resolve(dto);
    // Shared inputs are validated once up front; only the radius varies.
    this.poiseuille.validate(
      { radius: params.radius, length: params.length },
      { viscosity: params.viscosity, density: params.density },
      dto.pressureDrop,
    );

    const results = dto.points.map((point, index) =>
      this.runPoint(index, { radius: point.radius }, () =>
        this.poiseuille.evaluate({
          radius: point.radius,
          length: params.length,
          viscosity: params.viscosity,
          density: params.density,
          pressureDrop: dto.pressureDrop,
        }),
      ),
    );

    return this.summarize('radius', results);
  }

  flowScan(dto: FlowScanDto): ScanResponse<{ targetFlowRate: number }> {
    const params = this.resolver.resolve(dto);
    // Shared geometry/fluid validated once; only the target flow varies.
    this.inverseSolver.validate(
      { radius: params.radius, length: params.length },
      { viscosity: params.viscosity, density: params.density },
      1,
    );

    const results = dto.points.map((point, index) =>
      this.runPoint(index, { targetFlowRate: point.targetFlowRate }, () =>
        this.inverseSolver.solve({
          radius: params.radius,
          length: params.length,
          viscosity: params.viscosity,
          density: params.density,
          targetFlowRate: point.targetFlowRate,
        }),
      ),
    );

    return this.summarize('targetFlowRate', results);
  }

  /**
   * Isolate per-point failures: an invalid or not-laminar point produces a
   * structured error entry instead of failing the whole sweep. The wrapped
   * call is the exact same kernel method the single-point endpoints use.
   */
  private runPoint<TInput>(
    index: number,
    input: TInput,
    compute: () => ForwardResult | InverseResult,
  ): ScanPoint<TInput> {
    try {
      return { index, status: 'ok', input, result: compute() };
    } catch (err) {
      if (err instanceof FlowException) {
        return {
          index,
          status: 'error',
          input,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        };
      }
      return {
        index,
        status: 'error',
        input,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Unexpected error while evaluating scan point.',
        },
      };
    }
  }

  private summarize<TInput>(
    sweep: 'radius' | 'targetFlowRate',
    results: Array<ScanPoint<TInput>>,
  ): ScanResponse<TInput> {
    const errorCount = results.filter((r) => r.status === 'error').length;
    return {
      sweep,
      count: results.length,
      okCount: results.length - errorCount,
      errorCount,
      results,
    };
  }
}

export type { PhysicsParams };
