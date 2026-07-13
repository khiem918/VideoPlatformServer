// import { Controller, Get, Param, UseGuards } from '@nestjs/common';
// import { Query, Resolver } from '@nestjs/graphql';
// import { VideoService } from './video.service';
// import { RestAuthGuard } from 'src/auth/guard/rest-auth.guard';
// import { restCurrentUser } from 'src/auth/decorator/rest-current-user.decorator';

// @Controller()
// export class VideoController {
//     constructor(private readonly videoService: VideoService) { }

//     // @UseGuards(RestAuthGuard)
//     @Get('/:videoId/manifest')
//     async getVideoManifest(
//         // @restCurrentUser() user: { userId: string },
//         @Param('videoId') videoId: string
//     ) : Promise<any> {
//         return this.videoService.getVideoManifest("dsadsd", videoId);
//     }
// }
