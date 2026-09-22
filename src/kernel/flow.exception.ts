import { ErrorCode } from './error-codes';

/** Additional structured context (e.g. measured value, threshold). */
export interface FlowErrorDetails {
  [key: string]: number | string | undefined;
}

/**
 * Domain error carrying a stable, distinguishable {@link ErrorCode}.
 *
 * Thrown by the kernel/services before any result is produced, caught by the
 * global exception filter and serialized as a structured JSON error body.
 */
export class FlowException extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: FlowErrorDetails,
  ) {
    super(message);
    this.name = 'FlowException';
  }
}

/** Reject a value that must be a finite, strictly positive real number. */
export function assertPositive(
  value: number,
  code: ErrorCode,
  label: string,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new FlowException(code, `${label} must be a positive number.`, {
      received: value,
    });
  }
}

/** Reject a pressure drop that is not a finite, non-negative real number. */
export function assertNonNegativePressureDrop(dp: number): void {
  if (typeof dp !== 'number' || !Number.isFinite(dp) || dp < 0) {
    throw new FlowException(
      ErrorCode.INVALID_PRESSURE_DROP,
      'pressureDrop must be a non-negative number (backflow is not modeled).',
      { received: dp },
    );
  }
}

/** Reject a target flow rate that is not finite and strictly positive. */
export function assertPositiveTargetFlow(q: number): void {
  if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0) {
    throw new FlowException(
      ErrorCode.INVALID_TARGET_FLOW,
      'targetFlowRate must be a positive number.',
      { received: q },
    );
  }
}
