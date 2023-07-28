const AssistantV2 = require('ibm-watson/assistant/v2');
const {
  IamAuthenticator,
  CloudPakForDataAuthenticator,
} = require('ibm-watson/auth');
import { handleContextSkills, handleSpokenReturn } from './cardUtils';

//If you need to forcibly reset context variables from the orchestration server rather than the assistant,
//use the below list to fill the variables that need to be reset
const CONTEXT_VARIABLES = ['user-id'];

//General topics to use when demo mode is active which will hit intents to speak when not interactive;
const GREETER_TOPICS = [];

const ASSISTANT_VERSION = process.env.WATSON_ASSISTANT_VERSION;
const ASSISTANT_APIKEY = process.env.WATSON_ASSISTANT_APIKEY;
const ASSISTANT_SERVICEURL = process.env.WATSON_ASSISTANT_SERVICEURL;
const ASSISTANT_ID = process.env.WATSON_ASSISTANT_DRAFT_ENVIRONMENT_ID;
const USERNAME = process.env.WATSON_ASSISTANT_USERNAME;
const PASSWORD = process.env.WATSON_ASSISTANT_PASSWORD;
const CP4D_URL = process.env.WATSON_ASSISTANT_CP4D_URL;
const CP4D = process.env.WATSON_ASSISTANT_CP4D === 'true' ? true : false;

export const createWatsonAssistant = () => {
  let assistant;
  if (CP4D) {
    assistant = new AssistantV2({
      version: ASSISTANT_VERSION,
      authenticator: new CloudPakForDataAuthenticator({
        username: USERNAME,
        password: PASSWORD,
        url: CP4D_URL,
      }),
      serviceUrl: ASSISTANT_SERVICEURL,
      disableSslVerification: true,
    });
  } else {
    assistant = new AssistantV2({
      version: ASSISTANT_VERSION, //latest version
      authenticator: new IamAuthenticator({
        apikey: ASSISTANT_APIKEY,
      }),
      serviceUrl: ASSISTANT_SERVICEURL,
      disableSslVerification: true,
    });
  }
  return assistant;
};

export const createSession = async (assistant, sessionId) => {
  const sessionRes = await assistant.createSession({
    assistantId: ASSISTANT_ID,
  });
  sessionId = sessionRes.result.session_id;
  return sessionId;
};

export const deleteSession = async (assistant, sessionId) => {
  await assistant.deleteSession({
    assistantId: ASSISTANT_ID,
    sessionId: sessionId,
  });
};

export const watsonNewTopic = async (res, id, sessionCache) => {
  const assistant = sessionCache[id]['assistant'];
  const sessionId = await _sessionId(sessionCache[id]['sessionId'], assistant);
  const ws = sessionCache[id]['ws'];
  let spokenReturn = '';
  let variables = {};

  const textQuery =
    GREETER_TOPICS.length > 0 &&
    GREETER_TOPICS[Math.floor(Math.random() * GREETER_TOPICS.length)];

  const messageRes = await assistant.message({
    assistantId: ASSISTANT_ID,
    sessionId: sessionId,
    userId: sessionId,
    input: {
      message_type: 'text',
      text: textQuery,
      options: {
        return_context: true,
      },
    },
  });

  spokenReturn = handleSpokenReturn(messageRes, spokenReturn);
  handleContextSkills(messageRes, variables, id);
  const infoToSend = JSON.stringify(
    fnGetSpeechResponse(spokenReturn, variables)
  );

  res.send('New topic');
  ws.send(infoToSend);
};

export const watsonStopConvo = async (res, id, sessionCache, fn) => {
  const assistant = sessionCache[id]['assistant'];
  const sessionId = await _sessionId(sessionCache[id]['sessionId'], assistant);
  const ws = sessionCache[id]['ws'];
  const query =
    fn === 'StopConvo' ? 'stop_convo_low_speed' : 'What can you do?';
  let spokenReturn = '';
  let variables = {};

  const resContext = await assistant.message({
    assistantId: ASSISTANT_ID,
    sessionId: sessionId,
    userId: sessionId,
    input: {
      options: {
        return_context: true,
      },
    },
  });

  const messageRes = await assistant.message({
    assistantId: ASSISTANT_ID,
    sessionId: sessionId,
    userId: sessionId,
    input: {
      message_type: 'text',
      // text: "stop_convo_low_speed",
      text: query,
      options: {
        return_context: true,
      },
    },
  });

  spokenReturn = handleSpokenReturn(messageRes, spokenReturn);
  handleContextSkills(messageRes, variables, id);
  const infoToSend = JSON.stringify(
    fnGetSpeechResponse(spokenReturn, variables)
  );

  res.send('Stop Convo');
  ws.send(infoToSend);
};

export const watsonReset = async (bodyFn, res, id, sessionCache) => {
  const assistant = sessionCache[id]['assistant'];
  const ws = sessionCache[id]['ws'];
  let spokenReturn = '';
  let variables = {};

  if (bodyFn === 'ResetID') {
    console.log(
      'session timeout - set the session ID to null and reset context variables'
    );

    //reset all context variables, delete session, create new session, store in sessionCache

    const newSessionId = await _sessionId(null, assistant);
    await _watsonResetContextVariables(newSessionId, assistant);
    await deleteSession(assistant, sessionCache[id]['sessionId']);
    sessionCache[id]['sessionId'] = newSessionId;
    sessionCache[id]['userId'] = null;
    res.send('Session ID set to null');
    ws.send('Session ID set to null');
  } else if (bodyFn === 'ResetConvo') {
    console.log('should be resetting the conversation here');

    const newSessionId = await _sessionId(null, assistant);
    const messageRes = await _watsonResetContextVariables(
      newSessionId,
      assistant,
      'start over'
    );

    await deleteSession(assistant, sessionCache[id]['sessionId']);
    sessionCache[id]['sessionId'] = newSessionId;
    sessionCache[id]['userId'] = null;
    sessionCache[id]['user_defined'] = null;

    spokenReturn = handleSpokenReturn(messageRes, spokenReturn);
    handleContextSkills(messageRes, variables, id);
    const infoToSend = JSON.stringify(
      fnGetSpeechResponse(spokenReturn, variables)
    );

    res.send('Restarting the conversation');
    ws.send(infoToSend);
  } else {
    console.log('inactivity detected');

    sessionCache[id]['sessionId'] = null;
    sessionCache[id]['userId'] = null;
    sessionCache[id]['user_defined'] = null;
    res.send('Session ID set to null');
    ws.send('Reset successful');
    // curr_session_id = null;
    // res.send('Session ID set to null');
    // ws.send('Reset successful');
  }
};

export const watsonMessage = async (textQuery, sessionCache) => {
  const sessionId = await _sessionId(
    sessionCache['sessionId'],
    sessionCache['assistant']
  );
  // Placeholder for replace misheard words
  textQuery = _replaceMisheardWords(textQuery);
  const user_id = sessionCache['userId'] ? sessionCache['userId'] : sessionId;
  const messageRes = await sessionCache['assistant'].message({
    assistantId: ASSISTANT_ID,
    sessionId: sessionId,
    userId: user_id,
    input: {
      message_type: 'text',
      text: textQuery,
      options: {
        return_context: true,
      },
    },
    context: {
      skills: {
        'main skill': {
          user_defined: {
            lang_id: sessionCache['user_defined']?.lang_id,
          },
        },
      },
    },
  });

  // Store user_defined info
  sessionCache['user_defined'] =
    messageRes.result.context.skills['main skill'].user_defined;

  // console.log(`From watsonMessage: [${sessionCache['user_defined']?.lang_id}] ${JSON.stringify(messageRes, null, 2)}`);

  return messageRes;
};

export const fnGetSpeechResponse = (
  speakThis,
  variables,
  personaId = null,
) => {
  personaId = personaId || 1;
  const conversationResponse = {
    category: 'scene',
    kind: 'request',
    name: 'conversationResponse',
    transaction: null,
    body: {
      //personaId: personaId,
      personaId: 1,
      output: {
        text: speakThis,
      },
      variables: variables,
    },
  };
  return conversationResponse;
};

const _sessionId = async (sessionId, assistant) => {
  if (sessionId === null) {
    sessionId = createSession(assistant, sessionId);
  }
  return sessionId;
};

const _watsonResetContextVariables = async (
  sessionId,
  assistant,
  postText = ''
) => {
  //sessionId = await _sessionId(sessionId, assistant);
  const resetContextVariables = _resetContextVariables(CONTEXT_VARIABLES);

  const messageRes = await assistant.message({
    assistantId: ASSISTANT_ID,
    sessionId: sessionId,
    userId: sessionId,
    input: {
      message_type: 'text',
      text: postText,
      options: {
        return_context: true,
      },
    },
    context: {
      skills: {
        'main skill': {
          user_defined: resetContextVariables,
        },
      },
    },
  });
  return messageRes;
};

const _resetContextVariables = (contextVariables) => {
  return contextVariables.reduce((result, item) => {
    result[item] = null;
    return result;
  }, {});
};

// expansions {[word to send to Assistant]: [List of words that STT mishears]}
const expansions = {
  "truist": ["tris", "taurus", "taters"],
  "watsonx": ["watson x", "watson x dot ai"]
}

// replacements takes the list of misheard words in the expansions object and returns the following:
// const replacements = {
//   watson x: 'watsonx',
//   'watson x dot ai': 'watsonx'
// };

const _replacements = Object.entries(expansions).reduce((acc, [key, values]) => {
  values.forEach(value => {
    acc[value] = key;
  });
  return acc;
}, {});

// wordsToReplace takes in the expansions object and returns the following:
// ["watson x", "watson x dot ai", "tris", "taurus", "taters"]
const _wordsToReplace = Object.values(expansions).flat();

// pattern takes wordsToReplace and creates new regex expression to find those words in a string case insensitive
const _pattern = new RegExp('\\b(' + _wordsToReplace.join('|') + ')\\b', 'gi');

//_replaceMisheardWords is the function that takes in the textQuery sent from Soul Machines and finds potential misheard words and replaces them with 
// ones that NeuralSeek will find within Watson Discovery ie "Watson X" ->  "watsonx"
const _replaceMisheardWords = (textQuery) => {
  const result = textQuery.replace(_pattern, function(match) {
    return _replacements[match.toLowerCase()]
  });
  return result;
}

// pronuciations  {[word sent back from Assistant]: [phonetic representation of that word]}
const pronunciations = {
  "watsonx": "Watson X"
};

const _pronounceReplacementList = Object.entries(pronunciations).map(([word, replacement]) => {
  const pattern = new RegExp(`\\b${word}\\b`, 'gi');
  const replacementString = `@pronounce(${word}, ${replacement})`;
  return [pattern, replacementString];
});

// removes periods within a string ie "U.S.A." for better speech from Soul Machines
_pronounceReplacementList.push([/(?<!\w\.)\.(?!\s|$)/g, ' '])

// removes double quotes for edge cases when she hears a word that has a Soul Machines "@pronouce" function replacement
// Instead of the function being called, she will read out the function ie 'I have no information on "@pronounce(watsonx, Watson X)" something...'
_pronounceReplacementList.push([/"/g, ''])

// replaceForPronounce takes in the spokenReturn string that will be sent to Soul Machines for the Avatar so speak, and replaces mispronouced words
// with a Soul Machines function to pronouce it correctly ie. "watsonx" -> @pronounce(watsonx, Watson X)
export const replaceForPronounce = (string) => {
  let result = string;
  _pronounceReplacementList.forEach((replacement) => {
    result = result.replace(replacement[0], replacement[1])
  })
  return result;
}


export const pausePerWord = (intermediateMessageLength, wordsPerMinute) => {
  const pauseDuration = (60 / wordsPerMinute) * 1000;
  return intermediateMessageLength * pauseDuration;
};
