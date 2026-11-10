import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsPositive,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({
    description: 'Amount in smallest currency unit (e.g., 10000 for 10,000 XOF). Test Magic Values: 4002 (Insufficient Funds), 5004 (Gateway Timeout)',
    example: 10000,
  })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    description: 'Three-letter ISO currency code',
    default: 'XOF',
    example: 'XOF',
  })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string = 'XOF';

  @ApiProperty({
    description: 'Internal merchant order or transaction reference',
    example: 'CMD-8921',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference!: string;

  @ApiProperty({
    description: 'Customer mobile money or phone number in international E.164 format',
    example: '+2290166646310',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  customerPhone!: string;

  @ApiPropertyOptional({
    description: 'Customer email address for notifications',
    example: 'client@example.com',
  })
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @ApiPropertyOptional({
    description: 'Webhook callback URL to receive the cryptographic notification',
    example: 'https://webhook.site/cauri-demo-receiver',
  })
  @IsUrl({ require_tld: false })
  @IsOptional()
  webhookUrl?: string;
}
