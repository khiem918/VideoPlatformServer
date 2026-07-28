import { resolveGrpcBindUrl } from './resolve-grpc-bind-url';

describe('resolveGrpcBindUrl', () => {
  it('replaces a DNS hostname with 0.0.0.0 while keeping the configured port', () => {
    // Arrange
    const configuredUrl = 'api.vsp.internal:50051';

    // Act
    const boundUrl = resolveGrpcBindUrl(configuredUrl);

    // Assert
    expect(boundUrl).toBe('0.0.0.0:50051');
  });

  it('replaces localhost with 0.0.0.0 while keeping the configured port', () => {
    // Arrange
    const configuredUrl = 'localhost:50052';

    // Act
    const boundUrl = resolveGrpcBindUrl(configuredUrl);

    // Assert
    expect(boundUrl).toBe('0.0.0.0:50052');
  });

  it('falls back to the default port when no port is present', () => {
    // Arrange
    const configuredUrl = 'api.vsp.internal';

    // Act
    const boundUrl = resolveGrpcBindUrl(configuredUrl);

    // Assert
    expect(boundUrl).toBe('0.0.0.0:50051');
  });
});
