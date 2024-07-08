import {WebhookCallLiveTranscriptionEvent, WebhookConferenceLiveTranscriptionEvent} from '@wildix/wda-stream-client';
import {
  ConversationsClient,
  GetOrCreateDirectChannelCommand,
  SendMessageCommand,
} from '@wildix/xbees-conversations-client';

import PhasesStorage from './PhasesStorage';

export default class TranscriptionEventHandler {
  storage: PhasesStorage;

  conversationsClient: ConversationsClient;

  constructor(storage: PhasesStorage, conversationsClient: ConversationsClient) {
    this.storage = storage;
    this.conversationsClient = conversationsClient;
  }

  // Process conference transcription event and send a message if phase matched required condition.
  public async processTranscriptionEvent(
    event: WebhookCallLiveTranscriptionEvent | WebhookConferenceLiveTranscriptionEvent,
  ) {
    if (!event.data.chunk.isFinal) {
      // Ignore not final transcriptions to avoid duplicates in detection.
      return;
    }

    const match = this.storage.match(event.data.chunk.text);

    if (match) {
      const name = event.data.participant?.name || event.data.participant?.phone || 'unknown';
      const channelResponse = await this.conversationsClient.send(
        new GetOrCreateDirectChannelCommand({
          memberToInvite: {
            email: match.user.email,
          },
        }),
      );

      await this.conversationsClient.send(
        new SendMessageCommand({
          channelId: channelResponse.channel.channelId,
          text: `🚨 ${name}\n\nText: ${event.data.chunk.text}\nMatch: ${match.phase}`,
        }),
      );
    }
  }
}
