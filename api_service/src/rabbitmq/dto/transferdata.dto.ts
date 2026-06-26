import { IsString, IsNotEmpty } from "class-validator/types/decorator/decorators";

export class TransferVideoMetaDataResponse {
    @IsString()
    @IsNotEmpty()
    correlationId!: string;
    
    @IsString()
    @IsNotEmpty()
    status!: 'successed' | 'failed'; 

    @IsString()
    error?: string;
}
