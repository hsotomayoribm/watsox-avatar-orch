import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as WebSocket from 'ws';
import app from './app';
import axios from 'axios';
import config from './config';

import {
  createWatsonAssistant,
  createSession,
  watsonMessage,
  watsonReset,
  fnGetSpeechResponse,
  watsonNewTopic,
  watsonStopConvo,
  replaceForPronounce,
  pausePerWord
} from './watsonUtils';

import {
  handleContextSkills,
  handleCustomExtensionCard,
  handleNeuralSeekLink,
  handleSpokenReturn,
} from './cardUtils';

//Create a cache object to store browser session
const sessionCache = {};

const WORDS_PER_MINUTE_DELAY = process.env.WORDS_PER_MINUTE_DELAY || 150;
const ADD_DELAY_TO_NS_RESPONSE =
  process.env.ADD_DELAY_TO_NS_RESPONSE === 'true' ? true : false;

var httpServer = null;
//config.production is false on Local Enviroment. True on prod.
if (config.production === false) {
  //Local host development, use HTTPS
  var privateKey = fs.readFileSync(process.env.SSL_KEY, 'utf8');
  var certificate = fs.readFileSync(process.env.SSL_CERT, 'utf8');
  var credentials = { key: privateKey, cert: certificate };
  httpServer = https.createServer(credentials, app);
} else {
  console.log('Production deployment');
  //Create HTTP only equivalents in a GCP deploy
  httpServer = http.createServer(app);
}

const wsServer = new WebSocket.Server({ server: httpServer });

httpServer.listen(config.express.port, () => {
  console.log(`Orchestration server listening on port ${config.express.port}`);
});

wsServer.on('connection', async (ws: WebSocket) => {
  let assistant = null;
  let id = null;

  //Create Watson ASSISTANT service
  assistant = createWatsonAssistant();
  id = await createSession(assistant, id);

  //store session cache
  sessionCache[id] = {};
  //initialize connection between frontend and server on start, store initial id, assistant and ws
  sessionCache[id]['sessionId'] = id;
  sessionCache[id]['assistant'] = assistant;
  sessionCache[id]['ws'] = ws;
  sessionCache[id]['createdAt'] = new Date();

  console.log(
    `Websocket connection established. sessionId: ${sessionCache[id]['sessionId']} `
  );

  //connection is up, let's add a simple simple event
  ws.on('message', async (message: string) => {
    var messageObject = JSON.parse(message);
    if (
      messageObject?.kind === 'event' &&
      messageObject?.name === 'conversationRequest'
    ) {
      //Send textQuery to your Watson Assistant
      var textQuery = messageObject?.body?.input?.text;
      try {
        let spokenReturn = '';
        let variables = {};
        let dataToSend;

        let intermediateMessageLength = null;
        let apiStartTime = null;

        //Create message and send it to Watson
        let messageRes = await watsonMessage(textQuery, sessionCache[id]);

        //Custom Extensions will send back a field "skip_user_input", if it is true, resend a message to watson to force a response
        const customExtension =
          messageRes?.result?.context?.global?.system?.skip_user_input;

        if (customExtension === true) {
          console.log('Custom extension hit');
          console.log(`-------------------------------------\n`);

          spokenReturn = handleSpokenReturn(messageRes, spokenReturn);
          intermediateMessageLength = spokenReturn.split(' ').length;

          handleCustomExtensionCard('Generative AI', variables, id);
          apiStartTime = new Date();

          spokenReturn = `\@hideCards() \@showCards(customExtensionCard) ${spokenReturn}`;
          const result = replaceForPronounce(spokenReturn)

          dataToSend = JSON.stringify(fnGetSpeechResponse(result, variables));
          ws.send(dataToSend);
          spokenReturn = '';
          variables = {};
          messageRes = await watsonMessage('', sessionCache[id]);
        }

        spokenReturn = handleSpokenReturn(messageRes, spokenReturn);

        // For NeuralSeek responses, if an html link is interpolated in response, grab the value,
        // pass it to the front end, and append the Soul Machines' function call to the spoken return.
        const linkInResponse = spokenReturn.match(/href="([^"]*)/)
          ? spokenReturn.match(/href="([^"]*)/)[1]
          : null;

        if (linkInResponse) {
          handleNeuralSeekLink(linkInResponse, variables, id);
          console.log(`Link in response: ${linkInResponse}`);
          console.log(`-------------------------------------\n`);
        }

        handleContextSkills(messageRes, variables, id);

        // looks for words that are mispronounced, and interpolates a soul machines function into the string
        const result = replaceForPronounce(spokenReturn)
        dataToSend = JSON.stringify(fnGetSpeechResponse(result, variables, 1));

        // for use with CP4D and NeuralSeek. Often the response time is such that it will cut off the intermediate message,
        // the following function adds a dynamic delay to ensure the middle message is completed.
        if (
          ADD_DELAY_TO_NS_RESPONSE &&
          customExtension &&
          intermediateMessageLength !== null
        ) {
          const now = new Date();
          const apiResponseTime = now.getTime() - apiStartTime.getTime();
          console.log(`Api response time: ${apiResponseTime}`);

          const timeout =
            pausePerWord(intermediateMessageLength, WORDS_PER_MINUTE_DELAY) -
            apiResponseTime;
          console.log(
            `intermediateMessageLength: ${intermediateMessageLength},  timout: ${timeout}`
          );

          setTimeout(() => {
            console.log('Timeout Complete');
            console.log(`-------------------------------------\n`);
            ws.send(dataToSend);
            intermediateMessageLength = null;
            apiStartTime = null;
          }, timeout);
        } else {
          ws.send(dataToSend);
        }
      } catch (error) {
        console.log(
          `Error on watson assistant session connection and message sending`,
          error
        );
      }
    }
  });

  ws.addEventListener('error', function (event) {
    console.log('WebSocket error from Orchestration server: ', event);
  });
});

//*************************API Routes*************************//

app.post('/reset', async (req, res) => {
  const { fn, id } = req.body;
  console.log(`ID in reset: ${id}`);
  if (!id) {
    console.log(`ID in reset is null, return`);
    return;
  }
  await watsonReset(fn, res, id, sessionCache);
});

app.post('/newTopic', async (req, res) => {
  const { id } = req.body;
  console.log(`new topic id: ${id}`);
  if (!id) {
    console.log(`ID in newTopic is null, return`);
    return;
  }
  await watsonNewTopic(res, id, sessionCache);
});

app.get('/randomDog/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await axios.get('https://random.dog/woof.json');
    res.status(200).send(result.data);
  } catch (err) {
    console.log(err);
    res.status(500).send('Server error');
  }
});

app.post('/lowspeed', async (req, res) => {
  try {
    const { fn, id, speed } = req.body;
    if (!id) {
      console.log(`ID in lowspeed is null, return`);
      return;
    }
    console.log(`FN: ${fn}, ID: ${id}, SPEED: ${speed}`);
    await watsonStopConvo(res, id, sessionCache, fn);
  } catch (err) {
    console.log(err);
    res.status(500).send('Server error');
  }
});

app.get('/health', (req, res) => {
  console.log('In /health');
  res.json({
    status: 'UP',
  });
});
