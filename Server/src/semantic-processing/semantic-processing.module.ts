import { Module } from "@nestjs/common";
import { SemanticProcessingService } from "./semantic-processing.service";

@Module({
    providers: [SemanticProcessingService],
    exports: [SemanticProcessingService],
})
export class SemanticProcessingModule {}