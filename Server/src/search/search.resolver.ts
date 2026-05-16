import { Resolver } from "@nestjs/graphql";
import { SearchService } from "./search.service";
import { SearchVideosResponse } from "./dto/search-videos.response";
import { Args, Query, Int } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";
import { GqlAuthGuard } from "src/auth/guard/gql-auth.guard";
import { gqlCurrentUser } from "src/auth/decorator/gql-current-user.decorator";

@Resolver()
export class SearchResolver {
    constructor(
        private readonly searchService: SearchService,
    ) {}

    @Query(() => SearchVideosResponse)
    // @UseGuards(GqlAuthGuard) 
    async searchVideos(
        // @gqlCurrentUser() user: { userId: string },
        @Args('query') query: string,
        @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
        @Args('offset', { type: () => Int, defaultValue: 0 }) offset: number,
    ): Promise<SearchVideosResponse> {
        const result = await this.searchService.searchVideos("@jrALUe0g", query, limit, offset);
        return result as any;
    }
}