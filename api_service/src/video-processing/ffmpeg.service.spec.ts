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

function createChainableCommand(initialInput?: string) {
  const command: any = { _inputs: initialInput ? [initialInput] : [] };
  command.input = jest.fn((input: string) => {
    command._inputs.push(input);
    return command;
  });
  command.inputOptions = jest.fn().mockReturnValue(command);
  command.seekInput = jest.fn().mockReturnValue(command);
  command.complexFilter = jest.fn().mockReturnValue(command);
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
let createdCommands: any[];
const ffprobeMock = jest.fn();
const ffmpegFn = jest.fn((initialInput?: string) => {
  lastCommand = createChainableCommand(initialInput);
  createdCommands.push(lastCommand);
  return lastCommand;
});
(ffmpegFn as any).setFfmpegPath = jest.fn();
(ffmpegFn as any).setFfprobePath = jest.fn();
(ffmpegFn as any).ffprobe = (...args: any[]) => ffprobeMock(...args);

jest.mock('fluent-ffmpeg', () => ffmpegFn);

import { FFmpegService } from './ffmpeg.service';
import { S3Service } from '../s3/s3.service';
import { ConfigService } from '@nestjs/config';

describe('FFmpegService', () => {
  let service: FFmpegService;
  let s3Service: jest.Mocked<S3Service>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    lastCommand = undefined;
    createdCommands = [];
    s3Service = {} as unknown as jest.Mocked<S3Service>;
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;
    service = new FFmpegService(s3Service, configService);
  });

  function triggerEnd() {
    lastCommand._handlers.end();
  }

  function triggerError(error: Error) {
    lastCommand._handlers.error(error);
  }

  async function waitForCommandCount(count: number): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (
        createdCommands.length >= count &&
        createdCommands[count - 1]?._handlers?.end
      ) {
        return;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`Expected at least ${count} ffmpeg commands to be created`);
  }

  function triggerEndAt(index: number) {
    createdCommands[index]._handlers.end();
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
            { codec_type: 'audio' },
          ],
        });
      });

      const promise = service.transcodeToDASH('input.mp4', '/tmp/dash-output');

      // Audio is extracted once, up front (command #0)
      await waitForCommandCount(1);
      triggerEndAt(0);

      // The source is decoded exactly once: a single command builds the
      // downscaling ladder (360p/480p/720p/1080p for a 1080p source) and
      // fans it out to four outputs sharing one complexFilter graph (#1).
      await waitForCommandCount(2);
      expect(createdCommands[1].complexFilter).toHaveBeenCalledTimes(1);
      expect(createdCommands[1].output).toHaveBeenCalledTimes(4);
      triggerEndAt(1);

      // Final remux into a single manifest (command #2)
      await waitForCommandCount(3);
      triggerEndAt(2);

      const result = await promise;

      expect(result.manifest).toContain('manifest.mpd');
      expect(createdCommands[2].output).toHaveBeenCalledWith(
        expect.stringContaining('manifest.mpd'),
      );
    });

    it('does not start the manifest combination until the variant ladder finishes encoding', async () => {
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

      // No audio stream, so the first command created is the single ladder
      // encode (one decode pass, four outputs on the same process).
      await waitForCommandCount(1);
      expect(createdCommands).toHaveLength(1);
      expect(createdCommands[0].output).toHaveBeenCalledTimes(4);

      // Manifest combination must not start while the ladder is still running
      await new Promise((resolve) => setImmediate(resolve));
      expect(createdCommands).toHaveLength(1);

      triggerEndAt(0);

      await waitForCommandCount(2);
      expect(createdCommands).toHaveLength(2);

      triggerEndAt(1);

      await expect(promise).resolves.toEqual(
        expect.objectContaining({
          manifest: expect.stringContaining('manifest.mpd'),
        }),
      );
    });

    it('builds a sequential downscaling filter graph from highest to lowest resolution', async () => {
      ffprobeMock.mockImplementation((_path: string, cb: any) => {
        cb(null, {
          format: { duration: '10' },
          streams: [
            {
              codec_type: 'video',
              width: 1280,
              height: 720,
              bit_rate: '2500000',
            },
          ],
        });
      });

      const promise = service.transcodeToDASH('input.mp4', '/tmp/dash-output');

      await waitForCommandCount(1);
      const filterArg = createdCommands[0].complexFilter.mock.calls[0][0];

      expect(filterArg).toBe(
        '[0:v]scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2,split=2[v720p_out][v720p_next]; ' +
          '[v720p_next]scale=w=854:h=480:force_original_aspect_ratio=decrease:force_divisible_by=2,split=2[v480p_out][v480p_next]; ' +
          '[v480p_next]scale=w=640:h=360:force_original_aspect_ratio=decrease:force_divisible_by=2[v360p_out]',
      );

      triggerEndAt(0);
      await waitForCommandCount(2);
      triggerEndAt(1);

      await promise;
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
});
