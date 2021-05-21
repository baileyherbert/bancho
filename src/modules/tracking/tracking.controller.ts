import { ArgumentType, Command, CommandEvent, Controller, Group } from 'bancho';
import { EmbedFieldData, MessageEmbed } from 'discord.js';
import { TrackingService } from './tracking.service';
import moment from 'moment';

@Group('user')
export class TrackingController extends Controller {

	public constructor(protected service: TrackingService) {
		super();
	}

	@Command({
		name: 'names',
		description: 'Shows a user\'s name history.',
		arguments: [
			{
				name: 'member',
				description: 'The user to check. If not provided, displays your own history.',
				type: ArgumentType.User
			}
		]
	})
	public async onNameHistory(event: CommandEvent) {
		const member = event.getArgumentMember('member') ?? event.member;
		const data = await this.service.getMemberStore(member);
		const history = data.value.names.slice(0, 20);

		const namePlural = member.displayName + (member.displayName.toLowerCase().endsWith('s') ? `'` : `'s`);

		const items = history.reverse().map(record => {
			const timeAgo = Date.now() - record.timestamp;
			const time = moment(record.timestamp);
			const isThisYear = (time.format('YYYY') === moment().format('YYYY'));

            const timestamp = (timeAgo < (86400 * 7 * 1000)) ? time.fromNow() :
                ((isThisYear) ? time.format('MMMM Do h:mm a') :
					time.format('MMMM Do YYYY h:mm a'));

			return `**${record.name}**  ·  ${timestamp}`;
		});

        return event.send(new MessageEmbed({
			color: 0x2f3136,
			thumbnail: {
				url: member.user.displayAvatarURL({ size: 128 })
			},
			title: `${namePlural} names`,
			description: items.length > 0 ? items.join('\n') : 'None'
        }));
	}

	@Command({
		name: 'stats',
		description: 'Shows how long a user has been online recently.',
		arguments: [
			{
				name: 'member',
				description: 'The user to check. If not provided, displays your own stats.',
				type: ArgumentType.User
			}
		]
	})
	public async onStatistics(event: CommandEvent) {
		const member = event.getArgumentMember('member') ?? event.member;
		const namePlural = member.displayName + (member.displayName.toLowerCase().endsWith('s') ? `'` : `'s`);

		const day = await this.service.getUserStatistics(member.user, Date.now() - 86400000);
		const week = await this.service.getUserStatistics(member.user, Date.now() - 604800000);
		const month = await this.service.getUserStatistics(member.user, Date.now() - 2592000000);

		const fields = new Array<EmbedFieldData>();

		// Build the description
		// We'll add text to it later if we determine that we don't have enough data
		let description = `Below is the amount of time ${member} has been online recently.`;

		// Add the field for the last day
		fields.push({
			name: 'Last day',
			value: `${day.total.hours} ${day.total.hoursLabel} ` +
				(day.mobile.hours > 0 ? `(${day.mobile.hours} on mobile)` : '')
		});

		// Add the last week and month fields only if we have enough data
		if (week.total.hours !== day.total.hours) {
			fields.push({
				name: 'Last week',
				value: `${week.total.hours} ${week.total.hoursLabel} ` +
					(week.mobile.hours > 0 ? `(${week.mobile.hours} on mobile)` : '')
			});

			if (month.total.hours !== week.total.hours) {
				fields.push({
					name: 'Last month',
					value: `${month.total.hours} ${month.total.hoursLabel} ` +
						(month.mobile.hours > 0 ? `(${month.mobile.hours} on mobile)` : '')
				});
			}
		}

		return event.send({
			allowedMentions: { users: [] },
			embeds: [new MessageEmbed({
				title: `${namePlural} statistics`,
				description,
				fields,
				color: 0x2f3136,
				thumbnail: {
					url: member.user.displayAvatarURL({ size: 128 })
				},
			})]
		});
	}

}
