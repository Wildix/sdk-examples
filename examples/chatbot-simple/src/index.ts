import {
  ConversationsClient, SendMessageCommand,
  WebhookChatMessageNewEvent,
  WebhookEventType as ChatWebhookEventType,
} from '@wildix/xbees-conversations-client';

import express, {Request, Response} from 'express';
import ngrok from 'ngrok';

const app = express();
const port = 3110;

const botApiKey = 'BOT_API_TOKEN_HERE';

const conversationsClientToken = {token: () => Promise.resolve(botApiKey)};
const conversationsClient = new ConversationsClient({env: 'stage', token: conversationsClientToken});

function isEventProcessable(event: WebhookChatMessageNewEvent) {
  // Ignore event if channel have more than 2 members.
  if (event.data.channel.memberCount > 2) {
    return false;
  }

  // Ignore messages that was sent from bots.
  if (event.data.message.user.bot || event.botId === event.data.message.user.id) {
    return false;
  }

  // Ignore system events.
  if (event.data.message.type !== 'regular') {
    return false;
  }

  // Ignore messages without text.
  if (!event.data.message.text) {
    return false;
  }

  return true;
}

// Middleware to parse JSON
app.use(express.json());

// Handler for Bot webhook events
app.post('/bot/webhook', async (request: Request, response: Response) => {
  const event = request.body as WebhookChatMessageNewEvent;

  console.log('Event', JSON.stringify(event, null, 2));

  try {
    if (event.type === ChatWebhookEventType.MESSAGE_NEW) {
      if (isEventProcessable(event)) {
        await conversationsClient.send(
          new SendMessageCommand({
            channelId: event.data.channel.channelId,
            text: `Pong: ${event.data.message.text}`,
          }),
        );
      }
    }

    console.log('event complete!');

    response.json({message: 'Webhook processed successfully'});
  } catch (error) {
    console.error('Error processing webhook:', error);
    response.status(500).json({message: 'Internal server error'});
  }
});

// Start the server and Ngrok tunnel
app.listen(port, async () => {
  const url = await ngrok.connect(port);
  console.log(`Public URL: ${url}/bot/webhook`);
});
