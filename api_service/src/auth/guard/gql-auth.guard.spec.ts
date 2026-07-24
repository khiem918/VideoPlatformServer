import { UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GqlAuthGuard } from './gql-auth.guard';

describe('GqlAuthGuard', () => {
  let guard: GqlAuthGuard;
  let createSpy: jest.SpyInstance;

  beforeEach(() => {
    guard = new GqlAuthGuard();
  });

  afterEach(() => {
    createSpy.mockRestore();
  });

  it('returns the request extracted from the GraphQL context', () => {
    const req = { headers: {} };
    createSpy = jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req }),
    } as any);

    const result = guard.getRequest({} as any);

    expect(result).toBe(req);
  });

  it('throws UnauthorizedException when the GraphQL context has no request', () => {
    createSpy = jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({}),
    } as any);

    expect(() => guard.getRequest({} as any)).toThrow(UnauthorizedException);
  });
});
