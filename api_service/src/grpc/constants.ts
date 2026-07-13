import { join } from 'path';

export const GRPC_PROTO_PATH = join(process.cwd(), '../proto/video.proto');
export const GRPC_PACKAGE = 'video.metadata.v1';

export const VIDEO_METADATA_SERVICE_NAME = 'VideoMetaDataService';
export const DELETE_VIDEO_SERVICE_NAME = 'DeleteVideoService';
export const GRPC_CLIENT_PACKAGE = 'GRPC_CLIENT_PACKAGE';
