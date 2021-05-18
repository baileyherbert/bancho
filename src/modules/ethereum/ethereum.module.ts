import { Module } from 'bancho';
import { EthereumController } from './ethereum.controller';
import { EthereumService } from './ethereum.service';

@Module({
	name: 'ethereum',
	controllers: [EthereumController],
	services: [EthereumService]
})
export class EthereumModule {}
