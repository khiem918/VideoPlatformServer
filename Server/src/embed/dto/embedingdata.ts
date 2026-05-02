import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class EmbedDataDto {
    @IsString()
    @IsNotEmpty()
    videoId: string;

    @IsString()
    @IsNotEmpty()
    userOwner: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    description: string;

    @IsInt()
    createdAt: number;
}