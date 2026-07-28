import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function createHttpHost(response: {
    status: jest.Mock;
    json: jest.Mock;
  }): ArgumentsHost {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  }

  function createGraphQLHost(): ArgumentsHost {
    return {
      getType: () => 'graphql',
    } as unknown as ArgumentsHost;
  }

  describe('HTTP context', () => {
    it('formats an HttpException response with its status code and payload', () => {
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const host = createHttpHost({ status, json });
      const exception = new BadRequestException('invalid input');

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'invalid input',
          timestamp: expect.any(String),
        }),
      );
    });

    it('returns a generic 500 response for a plain Error outside production', () => {
      process.env.NODE_ENV = 'development';
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const host = createHttpHost({ status, json });

      filter.catch(new Error('unexpected failure'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'unexpected failure' }),
      );
    });

    it('hides the error message in production', () => {
      process.env.NODE_ENV = 'production';
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const host = createHttpHost({ status, json });

      filter.catch(new Error('leaky internal detail'), host);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Internal server error' }),
      );
    });

    it('returns a generic 500 response for a non-Error exception', () => {
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const host = createHttpHost({ status, json });

      filter.catch('a string error', host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Internal server error' }),
      );
    });
  });

  describe('GraphQL context', () => {
    it('throws a GraphQLError carrying the HttpException status and message', () => {
      const host = createGraphQLHost();
      const exception = new BadRequestException('invalid input');

      expect(() => filter.catch(exception, host)).toThrow(GraphQLError);

      try {
        filter.catch(exception, host);
      } catch (error) {
        expect((error as GraphQLError).extensions).toEqual(
          expect.objectContaining({ code: 'BAD_REQUEST', status: 400 }),
        );
      }
    });

    it('marks 5xx HttpExceptions with an INTERNAL_SERVER_ERROR extension code', () => {
      const host = createGraphQLHost();
      const exception = new BadRequestException('invalid input');
      jest.spyOn(exception, 'getStatus').mockReturnValue(500);

      try {
        filter.catch(exception, host);
        throw new Error('expected filter.catch to throw');
      } catch (error) {
        expect((error as GraphQLError).extensions).toEqual(
          expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
        );
      }
    });

    it('throws a GraphQLError for a plain Error outside production', () => {
      process.env.NODE_ENV = 'development';
      const host = createGraphQLHost();

      try {
        filter.catch(new Error('unexpected failure'), host);
        throw new Error('expected filter.catch to throw');
      } catch (error) {
        expect((error as GraphQLError).message).toBe('unexpected failure');
      }
    });

    it('hides the error message in production', () => {
      process.env.NODE_ENV = 'production';
      const host = createGraphQLHost();

      try {
        filter.catch(new Error('leaky internal detail'), host);
        throw new Error('expected filter.catch to throw');
      } catch (error) {
        expect((error as GraphQLError).message).toBe('Internal server error');
      }
    });

    it('throws a generic GraphQLError for a non-Error exception', () => {
      const host = createGraphQLHost();

      try {
        filter.catch('a string error', host);
        throw new Error('expected filter.catch to throw');
      } catch (error) {
        expect((error as GraphQLError).message).toBe('Internal server error');
      }
    });
  });
});
