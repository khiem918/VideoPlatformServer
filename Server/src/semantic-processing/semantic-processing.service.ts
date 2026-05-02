import { Injectable } from "@nestjs/common";

@Injectable()
export class SemanticProcessingService {
    constructor() {}

    async processingDescription(description: string): Promise<string> {
        if (!description) return '';

        const lines = description.split(/\n|\./);

        const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

        const processedLines = lines
            .filter(line => !urlRegex.test(line))
            .map(line => {
                return line.replace(/[^\p{L}\p{N}\s]/gu, '');
            })
            .map(line => {
                return line.trim().replace(/\s+/g, ' ');
            })
            .filter(line => line.length > 0);

        return processedLines.join(' ');
    }
}