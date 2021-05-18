export enum TrackingEvent {

	/**
	 * Emitted when a member's status (online, away, dnd, offline) is changed.
	 */
	MemberStatusChanged = 'tracking/memberStatusChanged',

	/**
	 * Emitted when a member changes their name.
	 */
	MemberNameChanged = 'tracking/memberNameChanged',

}
