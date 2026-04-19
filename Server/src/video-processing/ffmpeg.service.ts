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

  constructor(private s3Service: S3Service) {
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

  async transcodeToHLS(
    inputPath: string,
    outputDir: string,
  ): Promise<{ manifest: string }> {
    try {
      await fs.promises.mkdir(outputDir, { recursive: true });

      const metadata = await this.getVideoMetadata(inputPath);
      const originalWidth = metadata.width;
      const originalHeight = metadata.height;

      const qualities = [
        { name: '144p', w: 256, h: 144, bitrate: '200k' },
        { name: '360p', w: 640, h: 360, bitrate: '500k' },
        { name: '720p', w: 1280, h: 720, bitrate: '2500k' },
        { name: '1080p', w: 1920, h: 1080, bitrate: '5000k' },
        { name: '1440p', w: 2560, h: 1440, bitrate: '8000k' },
        { name: '2160p', w: 3840, h: 2160, bitrate: '15000k' },
      ].filter((q) => q.w <= originalWidth && q.h <= originalHeight);

      const variants: { quality: string; bitrate: string }[] = [];

      for (const q of qualities) {
        const playlist = path.join(outputDir, `${q.name}.m3u8`);
        const segmentPattern = path.join(outputDir, `${q.name}_segment_%03d.ts`);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(inputPath)
            .videoFilter(`scale=${q.w}:${q.h}`)
            .videoCodec('libx264')
            .videoBitrate(q.bitrate)
            .outputOptions([
              '-g 48',
              '-keyint_min 48',
              '-sc_threshold 0',
              '-c:a aac',
              '-b:a 128k',
              '-hls_time 6',
              '-hls_playlist_type vod',
              `-hls_segment_filename ${segmentPattern}`,
            ])
            .output(playlist)
            .on('end', () => {
              this.logger.log(`Transcoded ${q.name}`);
              resolve();
            })
            .on('error', (error) => {
              this.logger.error(`Transcoding ${q.name} failed: ${error.message}`);
              reject(error);
            })
            .run();
        });

        variants.push({
          quality: q.name,
          bitrate: q.bitrate,
        });
      }

      const masterPath = path.join(outputDir, 'master.m3u8');
      const masterContent = this.generateMasterPlaylist(variants);

      await fs.promises.writeFile(masterPath, masterContent);

      return { manifest: masterPath };
    } catch (error) {
      this.logger.error(`HLS transcoding failed: ${error.message}`);
      throw error;
    }
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

  private generateMasterPlaylist(
    variants: { quality: string; bitrate: string }[],
  ): string {
    const resolutionMap = {
      '144p': '256x144',
      '360p': '640x360',
      '720p': '1280x720',
      '1080p': '1920x1080',
      '1440p': '2560x1440',
      '2160p': '3840x2160',
    };

    let content = '#EXTM3U\n#EXT-X-VERSION:3\n';

    for (const v of variants) {
      const bitrate = parseInt(v.bitrate.replace('k', '')) * 1000;
      const resolution = resolutionMap[v.quality];

      content += `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate},RESOLUTION=${resolution}\n`;
      content += `${v.quality}.m3u8\n`;
    }

    return content;
  }

  async cleanup(dirPath: string): Promise<void> {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error.message}`);
    }
  }
}
