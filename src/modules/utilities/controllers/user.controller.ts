import { ArgumentType, Command, CommandEvent, Controller, Group } from 'bancho';
import { MessageEmbed } from 'discord.js';

@Group('user')
export class UserUtilitiesController extends Controller {

	@Command({
		name: 'info',
		description: 'Shows some extra information about a user.',
		arguments: [
			{
				name: 'member',
				description: 'The user to check. If not provided, shows information about yourself.',
				type: ArgumentType.User
			}
		]
	})
	public onUserInfo(event: CommandEvent) {
		const member = event.getArgumentMember('member') ?? event.member;

		return event.send('This command is coming soon! :o');
	}

	@Command({
		name: 'avatar',
		description: `Grab a user's avatar in full resolution.`,
		arguments: [
			{
				name: 'member',
				description: 'The user to check. If not provided, shows your own avatar.',
				type: ArgumentType.User
			}
		]
	})
	public onUserAvatar(event: CommandEvent) {
		const member = event.getArgumentMember('member') ?? event.member;
		const avatar = member.user.displayAvatarURL({ size: 32 });
		const url = member.user.displayAvatarURL({ size: 4096 });

		return event.send(new MessageEmbed({
			author: {
				name: member.displayName,
				icon_url: avatar
			},
			image: {
				url
			}
		}));
	}

}
