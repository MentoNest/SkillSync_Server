import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { requireValidWalletAddress } from './wallet-address';

/** Use as @Param('wallet', WalletAddressPipe) or @Body('walletAddress', WalletAddressPipe). */
@Injectable()
export class WalletAddressPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    try {
      return requireValidWalletAddress(value);
    } catch {
      throw new BadRequestException('Invalid Stellar wallet address');
    }
  }
}
