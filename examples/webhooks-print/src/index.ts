import express, {Request, Response} from 'express';
import ngrok from 'ngrok';

const app = express();
const port = 3110;

app.use(express.json());
app.post('/webhook', async (request: Request, response: Response) => {
  const event = request.body;

  console.log('Event', JSON.stringify(event, null, 2));

  response.json({message: 'OK'});
});

// Start the server and Ngrok tunnel
app.listen(port, async () => {
  const url = await ngrok.connect(port);
  console.log(`Public URL: ${url}/webhook`);
});
