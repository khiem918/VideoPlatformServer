import { Injectable } from "@nestjs/common";
import { SummarizeClient } from "./summarizeservice/summarize.client";

@Injectable()
export class SemanticProcessingService {
    constructor(
        private readonly summarizeClient : SummarizeClient,
    ) { }

    async processingDescription(description: string): Promise<string> {
        if (!description) return '';
        const urlRegex = /(https?:\/\/[^\s]*)|(www\.[^\s]+)/i;

        const lines = description.split(/\n|(?<=[.!?])\s+/);

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

    async summarizeDescription(description: string): Promise<string> {
        if (!description) return '';

        if (description.length <= 50) {
            return description;
        }

        return await this.summarizeClient.summarizeDescription(description);
    }

    async normalizeText(text: string): Promise<string> {
        return text.normalize('NFC')
                .toLowerCase()
                .replace(/[\p{P}\p{S}]/gu, '')
                .replace(/\s+/g, ' ')
                .trim();
    }
}