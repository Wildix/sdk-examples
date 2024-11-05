import {WebhookEventType} from '@wildix/wda-stream-client';
import {
  ConversationsClient,
  WebhookChatMessageNewEvent,
  WebhookEventType as ChatWebhookEventType,
} from '@wildix/xbees-conversations-client';

import express, {Request, Response} from 'express';
import ngrok from 'ngrok';
import OpenAI from 'openai';

import ChatEventHandler from './ChatEventHandler';
import PhasesStorage from './PhasesStorage';
import TranscriptionEventHandler from './TranscriptionEventHandler';

const app = express();
const port = 3110;

const botApiKey = '...';
const openaiApiKey = '...';
const openaiAssistantId = '...';

const openaiClient = new OpenAI({
  apiKey: openaiApiKey,
});

const conversationsClientToken = {token: () => Promise.resolve(botApiKey)};
const conversationsClient = new ConversationsClient({token: conversationsClientToken});

const phasesStorage = new PhasesStorage();
const botHandler = new ChatEventHandler(conversationsClient, openaiClient, openaiAssistantId, phasesStorage);
const transcriptionHandler = new TranscriptionEventHandler(phasesStorage, conversationsClient);

// Middleware to parse JSON
app.use(express.json());

// Handler for Bot webhook events
app.post('/bot/webhook', async (request: Request, response: Response) => {
  const event = request.body as WebhookChatMessageNewEvent;

  console.log('event', event);

  try {
    if (event.type === ChatWebhookEventType.MESSAGE_NEW) {
      await botHandler.processChatMessageNewEvent(event);
    }

    console.log('event complete!');

    response.json({message: 'Webhook processed successfully'});
  } catch (error) {
    console.error('Error processing webhook:', error);
    response.status(500).json({message: 'Internal server error'});
  }
});

// Handler for Call webhook events
app.post('/calls/webhook', async (request: Request, response: Response) => {
  const event = request.body as Record<string, unknown>;

  try {
    if (
      event.type === WebhookEventType.CALL_LIVE_TRANSCRIPTION ||
      event.type === WebhookEventType.CONFERENCE_LIVE_TRANSCRIPTION
    ) {
      await transcriptionHandler.processTranscriptionEvent(event as never);
    }

    response.json({message: 'Webhook processed successfully'});
  } catch (error) {
    console.error('Error processing webhook:', error);
    response.status(500).json({message: 'Internal server error'});
  }
});

// Start the server and Ngrok tunnel
app.listen(port, async () => {
  const url = await ngrok.connect(port);
  console.log(`Server is running at http://localhost:${port}`);
  console.log(`Public URL for Bot integration: ${url}/bot/webhook`);
  console.log(`Public URL for Webhooks integration: ${url}/calls/webhook`);
});
