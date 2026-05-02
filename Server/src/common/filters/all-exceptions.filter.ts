import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GqlContextType } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const contextType = host.getType<GqlContextType>();

    if (contextType === 'graphql') {
      return this.handleGraphQLException(exception);
    } else {
      return this.handleHttpException(exception, host);
    }
  }

  private handleGraphQLException(exception: unknown) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.message;
      this.logger.warn(`GraphQL Exception: ${status} - ${message}`);
      throw new GraphQLError(message, {
        extensions: {
          code: status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
          status,
        },
      });
    }

    if (exception instanceof Error) {
      this.logger.error(`GraphQL Error: ${exception.message}`, exception.stack);
      throw new GraphQLError(
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception.message,
        {
          extensions: {
            code: 'INTERNAL_SERVER_ERROR',
            status: HttpStatus.INTERNAL_SERVER_ERROR,
          },
        },
      );
    }

    this.logger.error('Unknown GraphQL exception:', exception);
    throw new GraphQLError('Internal server error', {
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      },
    });
  }

  private handleHttpException(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.message;
      this.logger.warn(`HTTP Exception: ${status} - ${message}`);
      return response.status(status).json({
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
      });
    }

    if (exception instanceof Error) {
      this.logger.error(`HTTP Error: ${exception.message}`, exception.stack);
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : exception.message,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.error('Unknown HTTP exception:', exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
