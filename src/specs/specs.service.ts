import { Injectable } from '@nestjs/common';
import { FluidParams, GeometryParams, PipeSpec } from '../kernel/types';
import { FlowException, assertPositive } from '../kernel/flow.exception';
import { ErrorCode } from '../kernel/error-codes';

/**
 * In-memory registry of named pipe/fluid specifications.
 *
 * Deliberately not persisted: entries live for the process lifetime and are
 * lost on restart. No file or database I/O happens here.
 */
@Injectable()
export class SpecsService {
  private readonly specs = new Map<string, PipeSpec>();

  /** Register a new named spec. Existing names are never overwritten. */
  register(
    name: string,
    params: GeometryParams & FluidParams,
  ): PipeSpec {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new FlowException(
        ErrorCode.INVALID_PAYLOAD,
        'spec name must be a non-empty string.',
        { received: name },
      );
    }
    const trimmed = name.trim();
    if (this.specs.has(trimmed)) {
      throw new FlowException(
        ErrorCode.SPEC_EXISTS,
        `Spec '${trimmed}' is already registered.`,
        { name: trimmed },
      );
    }
    // Validate geometry/fluid at registration time so a stored spec can
    // never carry an unusable value.
    assertPositive(params.radius, ErrorCode.INVALID_RADIUS, 'radius');
    assertPositive(params.length, ErrorCode.INVALID_LENGTH, 'length');
    assertPositive(
      params.viscosity,
      ErrorCode.INVALID_VISCOSITY,
      'viscosity',
    );
    assertPositive(params.density, ErrorCode.INVALID_DENSITY, 'density');

    const spec: PipeSpec = { name: trimmed, ...params };
    this.specs.set(trimmed, spec);
    return spec;
  }

  /** Fetch a spec by name or fail with unknown_spec before any calculation. */
  get(name: string): PipeSpec {
    const spec = this.specs.get(name);
    if (!spec) {
      throw new FlowException(
        ErrorCode.UNKNOWN_SPEC,
        `Spec '${name}' is not registered.`,
        { name },
      );
    }
    return spec;
  }

  has(name: string): boolean {
    return this.specs.has(name);
  }

  /** Read-only snapshot of every registered spec. */
  list(): PipeSpec[] {
    return [...this.specs.values()];
  }
}
