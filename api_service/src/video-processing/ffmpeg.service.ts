import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { S3Service } from '../s3/s3.service';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

@Injectable()
export class FFmpegService {
  private readonly logger = new Logger(FFmpegService.name);
  private readonly tempDir = '/tmp/video-processing';

<<<<<<< HEAD
  constructor(
    private configService: ConfigService,
  ) {
=======
  constructor(private s3Service: S3Service) {
>>>>>>> parent of 2247c5d (Merge pull request #5 from khiem918/feat/aws-integration)
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async extractThumbnail(
    inputPath: string,
    outputPath: string,
    timeSeconds: number = 3,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(timeSeconds)
        .outputOptions(['-vframes 1', '-vf scale=320:-1'])
        .output(outputPath)
        .on('end', () => {
          this.logger.log(`Thumbnail extracted to ${outputPath}`);
          resolve();
        })
        .on('error', (error) => {
          this.logger.error(`Thumbnail extraction failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  async transcodeToDASH(
    inputPath: string,
    outputDir: string,
  ): Promise<{ manifest: string }> {
    try {
      await fs.promises.mkdir(outputDir, { recursive: true });

      const metadata = await this.getVideoMetadata(inputPath);
      const originalWidth = metadata.width;
      const originalHeight = metadata.height;

      const qualities = [
        { name: '360p', w: 640, h: 360, bitrate: '500k' },
        { name: '720p', w: 1280, h: 720, bitrate: '2500k' },
        { name: '1080p', w: 1920, h: 1080, bitrate: '5000k' },
        { name: '1440p', w: 2560, h: 1440, bitrate: '8000k' },
        { name: '2160p', w: 3840, h: 2160, bitrate: '15000k' },
      ].filter((q) => q.w <= originalWidth && q.h <= originalHeight);

      if (qualities.length === 0) {
        throw new Error('No suitable quality variants for input resolution');
      }

      const manifestPath = path.join(outputDir, 'manifest.mpd');
      const outputOptions: string[] = [];

      for (let i = 0; i < qualities.length; i++) {
        outputOptions.push('-map', '0:v:0');
      }

      outputOptions.push('-map', '0:a:0?');
      outputOptions.push('-c:v', 'libx264');
      outputOptions.push('-c:a', 'aac');
      outputOptions.push('-b:a', '128k');

      qualities.forEach((q, i) => {
        outputOptions.push(`-b:v:${i}`, q.bitrate);
        outputOptions.push(`-s:v:${i}`, `${q.w}x${q.h}`);
      });

      outputOptions.push('-g', '48');
      outputOptions.push('-keyint_min', '48');
      outputOptions.push('-sc_threshold', '0');
      outputOptions.push('-use_template', '1');
      outputOptions.push('-use_timeline', '1');
      outputOptions.push('-seg_duration', '6');
      outputOptions.push('-adaptation_sets', 'id=0,streams=v id=1,streams=a');
      outputOptions.push('-f', 'dash');

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions(...outputOptions)
          .output(manifestPath)
          .on('end', () => {
            this.logger.log(
              `Transcoded to DASH with ${qualities.length} variants`,
            );
            resolve();
          })
          .on('error', (error) => {
            this.logger.error(`DASH transcoding failed: ${error.message}`);
            reject(error);
          })
          .run();
      });

      return { manifest: manifestPath };
    } catch (error) {
      this.logger.error(`DASH transcoding failed: ${error.message}`);
      throw error;
    }
  }

<<<<<<< HEAD
  private async hasAudioStream(filePath: string): Promise<boolean> {
    // Probe media streams and report whether an audio stream is present.
    const metadata = await this.probe(filePath);
    return metadata.streams.some(
      (stream: any) => stream.codec_type === 'audio',
    );
  }

  private buildDownscaleFilterGraph(qualities: QualityVariant[]): {
    filter: string;
    outputLabelByName: Map<string, string>;
  } {
    // Walk the ladder from highest to lowest resolution so each tier scales
    // down from the previous tier's output instead of the full-size source.
    const ladder = [...qualities].reverse();
    const outputLabelByName = new Map<string, string>();
    let sourceLabel = '[0:v]';

    const segments = ladder.map((quality, index) => {
      const isLast = index === ladder.length - 1;
      const scale = `scale=w=${quality.w}:h=${quality.h}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
      const outLabel = `[v${quality.name}_out]`;
      outputLabelByName.set(quality.name, outLabel);

      if (isLast) {
        return `${sourceLabel}${scale}${outLabel}`;
      }

      const nextLabel = `[v${quality.name}_next]`;
      const segment = `${sourceLabel}${scale},split=2${outLabel}${nextLabel}`;
      sourceLabel = nextLabel;
      return segment;
    });

    return { filter: segments.join('; '), outputLabelByName };
  }

  private getThreadsPerStream(variantCount: number): number {
    return Math.max(1, Math.floor(os.cpus().length / variantCount));
  }

  private async encodeVariantLadder(
    inputPath: string,
    interimDir: string,
    qualities: QualityVariant[],
  ): Promise<string[]> {
    // Single command decodes the source once and fans every quality tier
    // out of a shared downscaling filter graph, avoiding the redundant
    // decode passes a per-batch encode loop would incur.
    const outputPaths = qualities.map((quality) =>
      path.join(interimDir, `${quality.name}.mp4`),
    );
    const { filter, outputLabelByName } =
      this.buildDownscaleFilterGraph(qualities);
    const threads = this.getThreadsPerStream(qualities.length);

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(inputPath).complexFilter(filter);

      qualities.forEach((quality, i) => {
        command
          .output(outputPaths[i])
          .outputOptions([
            '-map',
            outputLabelByName.get(quality.name)!,
            '-an',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-threads',
            String(threads),
            '-b:v',
            quality.bitrate,
            '-maxrate',
            quality.maxrate,
            '-bufsize',
            quality.bufsize,
            '-g',
            '48',
            '-keyint_min',
            '48',
            '-sc_threshold',
            '0',
          ]);
      });

      command
        .on('end', () => resolve())
        .on('error', (error) => {
          const names = qualities.map((quality) => quality.name).join(', ');
          this.logger.error(
            `Failed to encode variant ladder [${names}]: ${error}`,
          );
          reject(error);
        })
        .run();
    });

    qualities.forEach((quality, i) => {
      this.logger.log(`Encoded ${quality.name} variant to ${outputPaths[i]}`);
    });

    return outputPaths;
  }

  private async encodeAudioTrack(
    inputPath: string,
    interimDir: string,
  ): Promise<string | null> {
    // Skip audio encoding if the source contains no audio stream.
    if (!(await this.hasAudioStream(inputPath))) {
      return null;
    }

    // Configure AAC audio encoding for DASH packaging.
    const outputPath = path.join(interimDir, 'audio.m4a');
    const outputOptions = [
      '-map',
      '0:a:0',
      '-vn',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
    ];

    // Run FFmpeg to generate the standalone audio track.
    await this.runFfmpegCommand(
      [inputPath],
      outputOptions,
      outputPath,
      'Failed to encode audio track',
    );

    // Log completion and return encoded audio path.
    this.logger.log(`Encoded audio track to ${outputPath}`);
    return outputPath;
  }

  private async combineToManifest(
    interimVideoFiles: string[],
    audioFile: string | null,
    qualities: QualityVariant[],
    manifestPath: string,
  ): Promise<void> {
    // Build FFmpeg input list from video tracks and optional audio track.
    const inputs = audioFile
      ? [...interimVideoFiles, audioFile]
      : interimVideoFiles;

    // Map each encoded video representation into the DASH output.
    const outputOptions: string[] = [];
    qualities.forEach((_, i) => {
      outputOptions.push('-map', `${i}:v:0`);
    });

    // Map encoded audio when available.
    if (audioFile) {
      outputOptions.push('-map', `${interimVideoFiles.length}:a:0`);
    }

    // Configure DASH muxing options and adaptation sets.
    outputOptions.push('-c', 'copy');
    outputOptions.push('-use_template', '1');
    outputOptions.push('-use_timeline', '1');
    outputOptions.push('-seg_duration', '6');
    outputOptions.push(
      '-adaptation_sets',
      audioFile ? 'id=0,streams=v id=1,streams=a' : 'id=0,streams=v',
    );
    outputOptions.push('-f', 'dash');

    // Execute manifest combination with all mapped streams.
    await this.runFfmpegCommand(
      inputs,
      outputOptions,
      manifestPath,
      'DASH manifest combination failed',
    );
  }

  private runFfmpegCommand(
    inputs: string[],
    outputOptions: string[],
    outputPath: string,
    errorContext: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Initialize command with all inputs before applying output settings.
      const command = ffmpeg(inputs[0]);
      inputs.slice(1).forEach((input) => command.input(input));

      // Run FFmpeg and resolve or reject based on process result.
      command
        .outputOptions(...outputOptions)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (error) => {
          this.logger.error(`${errorContext}: ${error}`);
          reject(error);
        })
        .run();
    });
  }

=======
>>>>>>> parent of 2247c5d (Merge pull request #5 from khiem918/feat/aws-integration)
  async getVideoMetadata(filePath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    bitrate: string;
  }> {
    const metadata = await this.probe(filePath);

    const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
    if (!videoStream) {
      throw new Error('No video stream found');
    }

    const duration = this.getDurationFromMetadata(metadata, videoStream);

    return {
      duration: Math.max(1, Math.round(duration)),
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      bitrate: videoStream.bit_rate || 'unknown',
    };
  }

  async extractVideoDuration(filePath: string): Promise<number> {
    const metadata = await this.probe(filePath);
    const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
    const duration = this.getDurationFromMetadata(metadata, videoStream);
    return Math.max(1, Math.round(duration));
  }

  private async probe(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          this.logger.error(`Failed to probe video metadata: ${err.message}`);
          reject(err);
          return;
        }

        resolve(metadata);
      });
    });
  }

  private getDurationFromMetadata(metadata: any, videoStream?: any): number {
    const parseToNumber = (value: unknown): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const formatDuration = parseToNumber(metadata?.format?.duration);
    const streamDuration = parseToNumber(videoStream?.duration);
    const duration = formatDuration > 0 ? formatDuration : streamDuration;

    if (duration <= 0) {
      throw new Error('Unable to extract video duration');
    }

    return duration;
  }

  async cleanup(dirPath: string): Promise<void> {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error.message}`);
    }
  }
}
