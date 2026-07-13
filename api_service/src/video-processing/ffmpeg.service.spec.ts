jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg-fake');
jest.mock('ffprobe-static', () => ({ path: '/usr/bin/ffprobe-fake' }));
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      rm: jest.fn().mockResolvedValue(undefined),
    },
  };
});

function createChainableCommand() {
  const command: any = {};
  command.seekInput = jest.fn().mockReturnValue(command);
  command.outputOptions = jest.fn().mockReturnValue(command);
  command.output = jest.fn().mockReturnValue(command);
  command.on = jest.fn((event: string, handler: (...args: any[]) => void) => {
    command._handlers = command._handlers || {};
    command._handlers[event] = handler;
    return command;
  });
  command.run = jest.fn(() => {
    command._ran = true;
  });
  return command;
}

let lastCommand: any;
const ffprobeMock = jest.fn();
const ffmpegFn = jest.fn(() => {
  lastCommand = createChainableCommand();
  return lastCommand;
});
(ffmpegFn as any).setFfmpegPath = jest.fn();
(ffmpegFn as any).setFfprobePath = jest.fn();
(ffmpegFn as any).ffprobe = (...args: any[]) => ffprobeMock(...args);

jest.mock('fluent-ffmpeg', () => ffmpegFn);

import { FFmpegService } from './ffmpeg.service';
import { S3Service } from '../s3/s3.service';

describe('FFmpegService', () => {
  let service: FFmpegService;
  let s3Service: jest.Mocked<S3Service>;

  beforeEach(() => {
    jest.clearAllMocks();
    lastCommand = undefined;
    s3Service = {} as unknown as jest.Mocked<S3Service>;
    service = new FFmpegService(s3Service);
  });

  function triggerEnd() {
    lastCommand._handlers.end();
  }

  function triggerError(error: Error) {
    lastCommand._handlers.error(error);
  }

  async function waitForRunningCommand(): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (lastCommand?._handlers?.end) {
        return;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('ffmpeg command was never invoked');
  }

  describe('extractThumbnail', () => {
    it('resolves when ffmpeg reports completion', async () => {
      const promise = service.extractThumbnail('input.mp4', 'thumb.jpg');
      triggerEnd();

      await expect(promise).resolves.toBeUndefined();
      expect(lastCommand.seekInput).toHaveBeenCalledWith(3);
      expect(lastCommand.output).toHaveBeenCalledWith('thumb.jpg');
    });

    it('rejects when ffmpeg reports an error', async () => {
      const promise = service.extractThumbnail('input.mp4', 'thumb.jpg');
      triggerError(new Error('extraction failed'));

      await expect(promise).rejects.toThrow('extraction failed');
    });
  });

  describe('getVideoMetadata', () => {
    it('returns parsed duration, resolution, and bitrate', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(null, {
          format: { duration: '65.4' },
          streams: [
            {
              codec_type: 'video',
              width: 1920,
              height: 1080,
              bit_rate: '5000000',
            },
          ],
        });
      });

      const result = await service.getVideoMetadata('input.mp4');

      expect(result).toEqual({
        duration: 65,
        width: 1920,
        height: 1080,
        bitrate: '5000000',
      });
    });

    it('throws when there is no video stream', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(null, { format: { duration: 10 }, streams: [] });
      });

      await expect(service.getVideoMetadata('input.mp4')).rejects.toThrow(
        'No video stream found',
      );
    });

    it('rejects when ffprobe reports an error', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(new Error('probe failed'), null);
      });

      await expect(service.getVideoMetadata('input.mp4')).rejects.toThrow(
        'probe failed',
      );
    });

    it('throws when duration cannot be determined', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(null, {
          format: {},
          streams: [{ codec_type: 'video', width: 100, height: 100 }],
        });
      });

      await expect(service.getVideoMetadata('input.mp4')).rejects.toThrow(
        'Unable to extract video duration',
      );
    });
  });

  describe('extractVideoDuration', () => {
    it('falls back to the stream duration when format duration is missing', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(null, {
          format: {},
          streams: [{ codec_type: 'video', duration: '42.9' }],
        });
      });

      const result = await service.extractVideoDuration('input.mp4');

      expect(result).toBe(43);
    });
  });

  describe('transcodeToDASH', () => {
    it('resolves with the manifest path when transcoding succeeds', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(null, {
          format: { duration: '65.4' },
          streams: [
            {
              codec_type: 'video',
              width: 1920,
              height: 1080,
              bit_rate: '5000000',
            },
          ],
        });
      });

      const promise = service.transcodeToDASH('input.mp4', '/tmp/dash-output');
      await waitForRunningCommand();
      triggerEnd();

      const result = await promise;

      expect(result.manifest).toContain('manifest.mpd');
      expect(lastCommand.output).toHaveBeenCalledWith(
        expect.stringContaining('manifest.mpd'),
      );
    });

    it('throws when the source resolution has no suitable quality variant', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(null, {
          format: { duration: '10' },
          streams: [{ codec_type: 'video', width: 100, height: 100 }],
        });
      });

      await expect(
        service.transcodeToDASH('input.mp4', '/tmp/dash-output'),
      ).rejects.toThrow('No suitable quality variants for input resolution');
    });
  });

  describe('cleanup', () => {
    it('does not throw when removing the directory fails', async () => {
      (require('fs').promises.rm as jest.Mock).mockRejectedValueOnce(
        new Error('fs error'),
      );

      await expect(service.cleanup('/tmp/some-dir')).resolves.toBeUndefined();
    });
  });
});
