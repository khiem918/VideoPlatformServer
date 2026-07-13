import { ConsumerService } from './consumer.service';
import { TransferDataRepository } from './repository/transferdata.repository';

describe('ConsumerService', () => {
  let service: ConsumerService;
  let repository: jest.Mocked<TransferDataRepository>;

  beforeEach(() => {
    repository = {
      updateProcessingStatus: jest.fn(),
    } as unknown as jest.Mocked<TransferDataRepository>;

    service = new ConsumerService(repository);
  });

  it('marks processing as successful for a successed message', async () => {
    await service.handleVideoMetadataRespone({
      correlationId: 'proc-1',
      status: 'successed',
    } as any);

    expect(repository.updateProcessingStatus).toHaveBeenCalledWith(
      'proc-1',
      'successed',
    );
  });

  it('marks processing as failed with the error message', async () => {
    await service.handleVideoMetadataRespone({
      correlationId: 'proc-1',
      status: 'failed',
      error: 'boom',
    } as any);

    expect(repository.updateProcessingStatus).toHaveBeenCalledWith(
      'proc-1',
      'failed',
      'boom',
    );
  });

  it('does nothing for an unrecognized status', async () => {
    await service.handleVideoMetadataRespone({
      correlationId: 'proc-1',
      status: 'unknown' as any,
    } as any);

    expect(repository.updateProcessingStatus).not.toHaveBeenCalled();
  });
});
