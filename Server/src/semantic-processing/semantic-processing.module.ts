import { Module } from "@nestjs/common";
import { SemanticProcessingService } from "./semantic-processing.service";
import { SummarizeClient } from "./summarizeservice/summarize.client";

@Module({
    providers: [SemanticProcessingService, SummarizeClient],
    exports: [SemanticProcessingService, SummarizeClient],
})
export class SemanticProcessingModule {}