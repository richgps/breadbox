/* eslint-disable  func-names */
/* eslint-disable  no-console */
/* eslint-disable  no-use-before-define */


// Breadbox: A bread proving IOT solution with Bread making guidance

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const https = require('https');


/* ----------------------- IoT Configuration -------------------------------- */
var config = {};

config.IOT_BROKER_ENDPOINT = "a2f0pt9qrlmeme.iot.us-west-2.amazonaws.com".toLowerCase();
config.IOT_BROKER_REGION = "us-west-2";
config.IOT_THING_NAME = "esp8266_0E65A1";
config.params = { thingName: config.IOT_THING_NAME };

/* --------------------- Breadbox configuration ----------------------------- */
const ciabattaImage = {
    smallImageUrl: 'https://s3-us-west-2.amazonaws.com/bread-box-assets/cards/ciabatta/ciabatta-small.jpg',
    largeImageUrl: 'https://s3-us-west-2.amazonaws.com/bread-box-assets/cards/ciabatta/ciabatta.jpg'
};

const defaultTemp = 29;
const maxTemp = 35;
const maxCheck = 4; // how many times to check for an update

// Initialize client for IoT
AWS.config.region = config.IOT_BROKER_REGION;
var iotData = new AWS.IotData({endpoint: config.IOT_BROKER_ENDPOINT});

// 1. Handlers ===================================================================================

const LaunchHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder = handlerInput.responseBuilder;

        const requestAttributes = attributesManager.getRequestAttributes();
        const speechOutput = `${requestAttributes.t('WELCOME')} ${requestAttributes.t('HELP')}`;
        return responseBuilder
            .speak(speechOutput)
            .reprompt(speechOutput)
            .getResponse();
    },
};

const TemperatureStatusHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'TemperatureStatusIntent';
    },

    handle(handlerInput) {
        return getBreadboxData().then(function(payload){
            const speechOutput = "Breadbox is currently" + getTemp(payload) + " degrees celcius";
            return handlerInput.responseBuilder.speak(speechOutput).getResponse();
       });
   },
};

const HumidityStatusHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'HumidityStatusIntent';
    },

    handle(handlerInput) {
    return getBreadboxData().then(function(payload){
           const speechOutput = "Breadbox humidity is " + getHumidity(payload) + " percent";
           return handlerInput.responseBuilder.speak(speechOutput).getResponse();
       });
   },
};

const ClimateStatusHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'ClimateStatusIntent';
    },

    handle(handlerInput) {
       return getBreadboxData().then(function(payload){
           const speechOutput = "Breadbox is currently " + getTemp(payload) + " degrees celcius with a humidity of " + getHumidity(payload) + " percent";
           return handlerInput.responseBuilder.speak(speechOutput).getResponse();
       });
   },
};

const TurnOnHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'TurnOnIntent';
    },

    handle(handlerInput) {
        var targetTemp = defaultTemp;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

        // check if the intents contains a temperature slot
        if (typeof handlerInput.requestEnvelope.request.intent.slots.temperature.value !== 'undefined') {
            targetTemp = parseInt(handlerInput.requestEnvelope.request.intent.slots.temperature.value, 10);
            if (isNaN(targetTemp)) {
                // Somehow a non Number has snuck through, ask to try again
                return handlerInput.responseBuilder.speak(requestAttributes.t('NOTSURE')).reprompt('What temperature would you like?').getResponse();
            }
        } else {
            return handlerInput.responseBuilder.speak(requestAttributes.t('WHATTEMP')).reprompt().getResponse();
        }


        if (targetTemp > maxTemp) {
            // target temp to high, give a reason why we
            return handlerInput.responseBuilder.speak(`${requestAttributes.t('OVERMAX')} ${maxTemp} degrees. ${requestAttributes.t('WHATTEMP')}`).reprompt().getResponse();
        }

        var newState = "";
        newState = {'on':true, 'targetTemp':targetTemp};

        return updateShadow(newState).then(function(){
            return checkTurnedOn().then(function(isOn){
                const speechOutput = (!isOn) ? "Looks like breadbox is not connected, please check and try again" :  `<speak>${requestAttributes.t('TURNON')} ${targetTemp} degrees. <say-as interpret-as="interjection">${randomPhrase(speechConsGood)}</say-as>.</speak>`;
                return handlerInput.responseBuilder.speak(speechOutput).getResponse();
            });

        });
    },
};

const TargetTemperatureIntent = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'TargetTemperatureIntent';
    },

    handle(handlerInput) {
        var targetTemp = defaultTemp;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

        // check if the intents contains a temperature slot
        if (typeof handlerInput.requestEnvelope.request.intent.slots.temperature.value !== 'undefined') {
            targetTemp = parseInt(handlerInput.requestEnvelope.request.intent.slots.temperature.value, 10);
            if (isNaN(targetTemp)) {
                // Somehow a non Number has snuck through, ask to try again
                return handlerInput.responseBuilder.speak(requestAttributes.t('NOTSURE')).reprompt('What temperature would you like?').getResponse();
            }
        } else {
            return handlerInput.responseBuilder.speak(requestAttributes.t('WHATTEMP')).reprompt().getResponse();
        }


        if (targetTemp > maxTemp) {
            // target temp to high, give a reason why we
            return handlerInput.responseBuilder.speak(`${requestAttributes.t('OVERMAX')} ${maxTemp} degrees. ${requestAttributes.t('WHATTEMP')}`).reprompt().getResponse();
        }

        var newState = "";
        newState = {'on':true, 'targetTemp':targetTemp};

        return updateShadow(newState).then(function(){
            return checkTurnedOn().then(function(isOn){
                const speechOutput = (!isOn) ? "Looks like breadbox is not connected, please check and try again" :  `<speak>${requestAttributes.t('TARGET')} ${targetTemp} degrees. <say-as interpret-as="interjection">${randomPhrase(speechConsGood)}</say-as>.</speak>`;
                return handlerInput.responseBuilder.speak(speechOutput).getResponse();
            });

        });
    },
};

const TurnOffHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'TurnOffIntent';
    },

    handle(handlerInput) {
        const newState = {'on':false};
        return Promise.all([getBreadboxData(),updateShadow(newState)]).then(function(data){
           // const isOn = getOn(data[0]);
            const isOn = true;
            const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
            const speechOutput = (isOn) ? `${requestAttributes.t('TURNOFF')}. <say-as interpret-as="interjection">${randomPhrase(speechGoodbye)}</say-as>` : `${requestAttributes.t('ALREADYOFF')}`;
            return handlerInput.responseBuilder.speak(speechOutput).getResponse();
        });
   },
};

const StopHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest'
            && (request.intent.name === 'AMAZON.NoIntent'
            || request.intent.name === 'AMAZON.CancelIntent'
            || request.intent.name === 'AMAZON.StopIntent');
    },

    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder = handlerInput.responseBuilder;

        const requestAttributes = attributesManager.getRequestAttributes();
        return responseBuilder
            .speak(requestAttributes.t('STOP'))
            .getResponse();
    },
};

const CiabattaHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'BakeCiabattaIntent';
    },

    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder = handlerInput.responseBuilder;
        const requestAttributes = attributesManager.getRequestAttributes();
        return responseBuilder
            .speak(requestAttributes.t('STARTCIABATTA'))
            .withStandardCard('Ciabatta', requestAttributes.t('CIABATTADETAIL'), ciabattaImage.smallImageUrl, ciabattaImage.largeImageUrl)
            .getResponse();
    },
};



const SessionEndedHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

        return handlerInput.responseBuilder.getResponse();
    },
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const request = handlerInput.requestEnvelope.request;

        console.log(`Error handled: ${error.message}`);
        console.log(` Original request was ${JSON.stringify(request, null, 2)}\n`);

        return handlerInput.responseBuilder
            .speak('Sorry, I can\'t understand the command. Please say again.')
            .reprompt('Sorry, I can\'t understand the command. Please say again.')
            .getResponse();
    },
};

const FallbackHandler = {

  // 2018-May-01: AMAZON.FallackIntent is only currently available in en-US locale.

  //              This handler will not be triggered except in that locale, so it can be

  //              safely deployed for any locale.

  canHandle(handlerInput) {

    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'

      && request.intent.name === 'AMAZON.FallbackIntent';

  },

  handle(handlerInput) {

    return handlerInput.responseBuilder

      .speak(FALLBACK_MESSAGE)

      .reprompt(FALLBACK_REPROMPT)

      .getResponse();

  },

};


// 2. Constants ==================================================================================

const speechConsGood = ["Awesome", "All righty", "Bam", "Bazinga", "Bob's your uncle", "Boom", "Booya", "Cha Ching", "Dynomite", "Hurrah", "Hurray", "Huzzah", "Kaboom", "Kaching",
"Righto", "Simples", "Ta da", "Way to go", "Well done", "Whee", "Woo hoo", "Yay", "Wowza", "Yowsa"];

const speechGoodbye = ["Goodbye", "Farewell", "Have a good day", "Take care", "Bye", "See you later", "OK, have a good one", "Laters", "Talk to you later", "So long", "Catch you later", "Peace out", "Adios", "Ciao", "Au revoir", "Sayonara"];

const languageStrings = {
    en: {
        translation: {
            WELCOME: 'Welcome to breadbox.',
            HELP: 'Just say start warming and I\'ll let you know when it\'s ready.',
            NODATA: 'Sorry, Breadbox is unavailable at the moment . Please try again later.',
            TURNON: 'OK <prosody rate="fast">warming</prosody> up to ',
            TARGET: 'OK target temperature is now ',
            TURNOFF: 'OK switching off and cooling down.',
            ALREADYOFF: 'Breadbox is already switched off.',
            STOP: 'OK, catch you later',
            OVERMAX: 'Sorry, maximum temperature is ',
            WHATTEMP: 'What temperature would you like?',
            NOTSURE: 'Sorry, I didn\'t quite catch that.',
            STARTCIABATTA: 'OK, I\'ve sent details to your Alexa app.',
            CIABATTADETAIL: 'Ferment: 17-24 hours\nPreparation: 30-45 minutes\nResting: 1.5 hours\nProving:45-60 minutes\nBaking: 18-20 minutes\n\nYou can ask alexa to:\n"Start the ferment"'
        },
    },
    // , 'de-DE': { 'translation' : { 'TITLE'   : "Local Helfer etc." } }
};


const SKILL_NAME = 'Breadbox';
const FALLBACK_MESSAGE = `Just say start warming to begin.`;
const FALLBACK_REPROMPT = 'Try saying start warming';



// 3. Helper Functions ==========================================================================

function getBreadboxData() {
    return new Promise(function (resolve, reject) {
        // Use the IoT SDK to get the current shadow data
        iotData.getThingShadow(config.params, function(err, data) {
            if (err)  {
                console.log(err, err.stack); // an error occurred
            } else {
                // Get the payload and parse it
                var payload = JSON.parse(data.payload);
                resolve(payload);
            }
        });
    });
}

function getTemp(payload){
    return round(payload.state.reported.temp,1);
}

function getHumidity(payload){
    return round(payload.state.reported.humidity,1);
}

function getOn(payload){
    return payload.state.reported.on;
}

function round(value, decimals) {
  return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

const delay = t => new Promise(resolve => setTimeout(resolve, t));

function getTimeStamp() {
    return Math.round((new Date()).getTime() / 1000);
}

// Wait for box to report it's turned on
function checkTurnedOn(checkCount) {
    checkCount = checkCount || 0;
    if (checkCount > maxCheck) {
        return false;
    }

    // get current shadow state
    return getBreadboxData().then(function(payload){
        var isOn = payload.state.reported.on;
        if (isOn) {
            // check ON timestamp is recent, shadow state may remain on when powered off
            if ((getTimeStamp() - payload.metadata.reported.on.timestamp) > 60) {
                return false; // too much of a delay, box must be disconnected
            }
        }
        return isOn
        ? true
        : delay(250).then(() => checkTurnedOn(checkCount + 1));
    });
}

function randomPhrase(myData) {
    // the argument is an array [] of words or phrases
    var i = 0;
    i = Math.floor(Math.random() * myData.length);
    return(myData[i]);
}

function updateShadow(desiredState) {
    return new Promise(function (resolve, reject) {
        //Prepare the parameters of the update call

        var paramsUpdate = {
            "thingName" : config.IOT_THING_NAME,
            "payload" : JSON.stringify(
                { "state":
                    { "desired": desiredState             //
                    }
                }
            )
        };

        iotData.updateThingShadow(paramsUpdate, function(err, data)  {
            if (err){
                console.log(err);
                reject("not ok");
            }
            else {
                console.log("updated thing shadow " + config.IOT_THING_NAME + ' to state ' + paramsUpdate.payload);
                resolve("ok");
            }

        });
    });
}

const LocalizationInterceptor = {
    process(handlerInput) {
        const localizationClient = i18n.use(sprintf).init({
            lng: handlerInput.requestEnvelope.request.locale,
            overloadTranslationOptionHandler: sprintf.overloadTranslationOptionHandler,
            resources: languageStrings,
            returnObjects: true,
        });

        const attributes = handlerInput.attributesManager.getRequestAttributes();
        attributes.t = function (...args) {
            return localizationClient.t(...args);
        };
    },
};

// 4. Export =====================================================================================

const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
    .addRequestHandlers(
        LaunchHandler,
        TemperatureStatusHandler,
        TargetTemperatureIntent,
        HumidityStatusHandler,
        ClimateStatusHandler,
        TurnOnHandler,
        TurnOffHandler,
        StopHandler,
        CiabattaHandler,
        FallbackHandler,
        SessionEndedHandler
    )
    .addRequestInterceptors(LocalizationInterceptor)
    .addErrorHandlers(ErrorHandler)
    .lambda();
