import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
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

interface QualityVariant {
  name: string;
  w: number;
  h: number;
  bitrate: string;
  maxrate: string;
  bufsize: string;
}

@Injectable()
export class FFmpegService {
  private readonly logger = new Logger(FFmpegService.name);
  private readonly tempDir = '/tmp/video-streaming-system/processing';

  constructor(
    private configService: ConfigService,
  ) {
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
          this.logger.error(`Thumbnail extraction failed: ${error}`);
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
      // Ensure the output directory exists before generating DASH artifacts.
      await fs.promises.mkdir(outputDir, { recursive: true });

      // Read source metadata to limit output variants to supported resolutions.
      const metadata = await this.getVideoMetadata(inputPath);
      const originalWidth = metadata.width;
      const originalHeight = metadata.height;

      // Build quality ladder and keep only variants not exceeding source dimensions.
      const qualities: QualityVariant[] = [
        {
          name: '360p',
          w: 640,
          h: 360,
          bitrate: '500k',
          maxrate: '550k',
          bufsize: '1000k',
        },
        {
          name: '480p',
          w: 854,
          h: 480,
          bitrate: '800k',
          maxrate: '900k',
          bufsize: '1600k',
        },
        {
          name: '720p',
          w: 1280,
          h: 720,
          bitrate: '1800k',
          maxrate: '2000k',
          bufsize: '3600k',
        },
        {
          name: '1080p',
          w: 1920,
          h: 1080,
          bitrate: '3500k',
          maxrate: '3800k',
          bufsize: '7000k',
        },
        {
          name: '1440p',
          w: 2560,
          h: 1440,
          bitrate: '6000k',
          maxrate: '6400k',
          bufsize: '12000k',
        },
        {
          name: '2160p',
          w: 3840,
          h: 2160,
          bitrate: '15000k',
          maxrate: '16500k',
          bufsize: '30000k',
        },
      ].filter((q) => q.w <= originalWidth && q.h <= originalHeight);

      // Fail early when no valid representation can be generated.
      if (qualities.length === 0) {
        throw new Error('No suitable quality variants for input resolution');
      }

      // Prepare a temporary workspace for encoded tracks.
      const interimDir = path.join(outputDir, 'interim');
      await fs.promises.mkdir(interimDir, { recursive: true });

      // Encode optional audio track once for all video representations.
      const audioFile = await this.encodeAudioTrack(inputPath, interimDir);

      // Decode the source once and encode every quality variant in a single
      // pass via a sequential downscaling ladder (highest resolution first).
      const interimVideoFiles = await this.encodeVariantLadder(
        inputPath,
        interimDir,
        qualities,
      );

      // Merge encoded tracks into a final DASH manifest.
      const manifestPath = path.join(outputDir, 'manifest.mpd');
      await this.combineToManifest(
        interimVideoFiles,
        audioFile,
        qualities,
        manifestPath,
      );

      // Record successful DASH packaging and return manifest location.
      this.logger.log(`Transcoded to DASH with ${qualities.length} variants`);

      // Clean up interim workspace.
      await fs.promises.rm(interimDir, { recursive: true, force: true });

      return { manifest: manifestPath };
    } catch (error) {
      // Log and rethrow to preserve error handling upstream.
      this.logger.error(`DASH transcoding failed: ${error}`);
      throw error;
    }
  }

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
          this.logger.error(`Failed to probe video metadata: ${err}`);
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
}
