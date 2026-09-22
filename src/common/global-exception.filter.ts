import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ERROR_HTTP_STATUS, ErrorCode } from '../kernel/error-codes';
import { FlowException } from '../kernel/flow.exception';

interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * Single place that turns failures into structured JSON:
 *   { "error": { "code", "message", "details?" } }
 *
 * - {@link FlowException} (domain validation, unknown spec, not_laminar, …)
 *   carries a stable code and its mapped HTTP status.
 * - Validation-pipe {@link HttpException}s are normalized to invalid_payload.
 * - Anything else is hidden behind internal_error (logged, never leaked).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof FlowException) {
      response.status(ERROR_HTTP_STATUS[exception.code]).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      } satisfies ErrorBody);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (status === 404) {
        response.status(404).json({
          error: {
            code: ErrorCode.ROUTE_NOT_FOUND,
            message: exception.message,
          },
        } satisfies ErrorBody);
        return;
      }
      // class-validator errors arrive as { message: string[] | string, error }
      const details =
        typeof raw === 'object' && raw !== null && 'message' in raw
          ? (raw as Record<string, unknown>).message
          : raw;
      response.status(status).json({
        error: {
          code: ErrorCode.INVALID_PAYLOAD,
          message: exception.message,
          details,
        },
      } satisfies ErrorBody);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error.',
      },
    } satisfies ErrorBody);
  }
}
