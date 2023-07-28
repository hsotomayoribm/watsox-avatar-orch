export const handleContextSkills = (messageRes, variables, id) => {
  const dialogResponse =
    messageRes.result.context.skills['main skill']?.user_defined;

  const actionResponse =
    messageRes.result.context.skills['actions skill']?.skill_variables;

  const resContext = actionResponse ? actionResponse : dialogResponse;

  //set browserId for API Calls, sessionCache
  _setBrowserId(resContext, variables, id);

  //If context variable set in Watson (ie $public-options = {data:[...]})
  _addCardIfVariableFound(resContext, variables, id);

  //handle search skill results for actions/dialogs
  _addCardActionForSearch(messageRes, variables, id);
};

export const handleCustomExtensionCard = (
  customExtensionName,
  variables,
  id
) => {
  _addCustomExtenstionCard(customExtensionName, variables, id);
};

export const handleNeuralSeekLink = (link, variables, id) => {
  _addNeuralSeekLinkCard(link, variables, id);
};

const _setBrowserId = (resContext, variables, id) => {
  if (resContext && resContext['browserIdSet']) {
    let actionVariable = {
      data: { id },
      component: 'browserIdSet',
    };
    variables[`public-browserIdSet`] = JSON.stringify(actionVariable);
  }
};

export const handleSpokenReturn = (messageRes, spokenReturn) => {
  const resOutput = messageRes.result.output.generic;
  resOutput.forEach((messageObject) => {
    if (messageObject.response_type === 'text') {
      spokenReturn = spokenReturn + ' ' + messageObject.text;
    }
    if (messageObject.response_type === 'search') {
      spokenReturn = spokenReturn + ' ' + messageObject.header;
    }
  });
  return spokenReturn;
};

const _addCardIfVariableFound = (resContext, variables, id) => {
  if (!resContext) return;
  const keys = Object.keys(resContext);
  keys.forEach((item) => {
    if (_publicPrefix(item) && resContext[item] && resContext[item]['data']) {
      resContext[item]['data']['id'] = id;
      //for content aware custom component, the SM will look for the value placed here to know where the component is on the page
      resContext[item]['data']['cardId'] = resContext[item]['id']
        ? resContext[item]['id']
        : resContext[item]['type'];

      //when using actions, the session variables will be have the '-' replaced with '_'. When sending to SM we revert the underscores back to dashes.
      const variable = item.replace('_', '-');
      variables[variable] = JSON.stringify(resContext[item]);
    }
  });
};

const _addCardActionForSearch = (messageRes, variables, id) => {
  let data: Object;
  let actionVariable: Object;

  const resOutput = messageRes.result.output.generic;
  resOutput.forEach((messageObject) => {
    if (messageObject.response_type === 'search') {
      data = messageObject.primary_results || [];
      actionVariable = {
        data: { data },
        component: 'search',
        id: id,
      };

      variables['public-search'] = JSON.stringify(actionVariable);
    }
  });
};

const _addCustomExtenstionCard = (customExtensionName, variables, id) => {
  let data: Object;
  let actionVariable: Object;
  actionVariable = {
    data: { name: customExtensionName },
    component: 'customExtensionCard',
    type: 'customExtensionCard',
    id: id,
  };
  variables['public-customExtensionCard'] = JSON.stringify(actionVariable);
};

const _addNeuralSeekLinkCard = (link, variables, id) => {
  let data: Object;
  let actionVariable: Object;
  actionVariable = {
    data: { link: link },
    component: 'neuralSeekLink',
    type: 'neuralSeekLink',
    id: id,
  };
  variables['public-neuralSeekLink'] = JSON.stringify(actionVariable);
};

const _publicPrefix = (item) => {
  const itemCheck = item.replace('_', '-').split('-')[0];
  if (itemCheck === 'public') return true;
  return false;
};
