import {WebhookCallCompletedEvent, WebhookEventType} from '@wildix/wda-stream-client';

import express, {Request, Response} from 'express';
import {ActivitiesApi, ActivityPostObject, ApiClient} from 'pipedrive';

const app = express();
const port = 3100;

// Pipedrive API setup
const apiClient = new ApiClient();
const apiToken = apiClient.authentications.api_key;
apiToken.apiKey = 'YOUR_API_TOKEN_HERE';
const activitiesApi = new ActivitiesApi(apiClient);

// Middleware to parse JSON
app.use(express.json());

// Process call completed event and create activities in Pipedrive
async function processCallCompletedEvent(event: WebhookCallCompletedEvent) {
  const promises = event.data.flows.map(async (flow) => {
    const callerName = flow.caller?.name || flow.caller?.phone || 'unknown';
    const calleeName = flow.callee?.name || flow.callee?.phone || 'unknown';
    const endDate = new Date(flow.endTime);

    const activityData = ActivityPostObject.constructFromObject({
      subject: `Call with ${callerName} and ${calleeName}`,
      type: 'call',
      done: 1,
      note: `Call completed between ${callerName} and ${calleeName}. Duration: ${flow.duration} seconds.`,
      due_date: endDate.toISOString().split('T')[0],
      due_time: endDate.toISOString().split('T')[1].split('.')[0],
      // Fill other options that relate to your structure.
      // person_id: '<person_id>',
      // lead_id: '<lead_id>',
      // project_id: '<project_id>',
      // org_id: '<org_id>',
    });

    try {
      const activity = await activitiesApi.addActivity(activityData);

      if (activity) {
        console.log('Activity created successfully in Pipedrive');
      } else {
        console.error('Failed to create activity in Pipedrive');
      }
    } catch (error) {
      console.error('Error creating activity in Pipedrive:', error);
    }
  });

  await Promise.all(promises);
}

// Handler for webhook events
app.post('/webhook', async (request: Request, response: Response) => {
  const event = request.body as WebhookCallCompletedEvent;

  try {
    if (event.type === WebhookEventType.CALL_COMPLETED) {
      await processCallCompletedEvent(event);
    }

    response.json({message: 'Webhook processed successfully'});
  } catch (error) {
    console.error('Error processing webhook:', error);
    response.status(500).json({message: 'Internal server error'});
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
