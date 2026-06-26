import { Injectable } from "@nestjs/common";

@Injectable()
export class SummarizeClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    
    constructor() {
        this.baseUrl = process.env.SUMMARIZE_API_URL || 'http://localhost:8090';
        this.apiKey = process.env.SUMMARIZE_API_KEY || 'default_api_key';
    }

    async summarizeDescription(text: string): Promise<string> {
        const response = await fetch(`${this.baseUrl}/desc/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
            body: JSON.stringify({ text }),
        });     

        if (!response.ok) {
            const errorDetail = await response.text();
            throw new Error(`Failed to summarize description: ${response.status} - ${errorDetail}`);
        }

        return response.json();
    }
}       