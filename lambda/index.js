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

const defaultTemperature = 28;

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
            const speechOutput = "It's currently " + getTemp(payload) + " degrees celcius";
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
           const speechOutput = "Humidity is " + getHumidity(payload) + " percent";
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
           const speechOutput = "It's currently " + getTemp(payload) + " degrees celcius with a humidity of " + getHumidity(payload) + " percent";
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
        var desiredTemp = handlerInput.requestEnvelope.request.intent.slots.temperature.value;
        var newState = "";
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        if (desiredTemp == null) { // no temp slot
            newState = {'on':true};
        } else {
            newState = {'on':true, 'temp':desiredTemp};
        }

        return updateShadow(newState).then(function(){
            const speechOutput = (desiredTemp == null) ? `${requestAttributes.t('TURNON')}` : `${requestAttributes.t('TURNON')} ${requestAttributes.t('TARGET')} ${desiredTemp} degrees`;
            return handlerInput.responseBuilder.speak(speechOutput).getResponse();
        });
    },
};

const TurnOffHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'TurnOffIntent';
    },

    handle(handlerInput) {
        const newState = {'on':true};
        return Promise.all([getBreadboxData(),updateShadow(newState)]).then(function(data){
            const isOn = getOn(data[0]);
            const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
            const speechOutput = (isOn) ? `${requestAttributes.t('TURNOFF')}` : `${requestAttributes.t('ALREADYOFF')}`;
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

const languageStrings = {
    en: {
        translation: {
            WELCOME: 'Welcome to Breadbox.',
            HELP: 'Just say start warming and I\'ll let you know when it\'s ready.',
            NODATA: 'Sorry, Breadbox is unavailable at the moment . Please try again later.',
            TURNON: 'OK warming up.',
            TARGET: 'Target temperature is ',
            TURNOFF: 'OK switching off and cooling down.',
            ALREADYOFF: 'Breadbox is already switched off.',
            STOP: 'OK, catch you later',
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
        HumidityStatusHandler,
        ClimateStatusHandler,
        TurnOnHandler,
        TurnOffHandler,
        StopHandler,
        FallbackHandler,
        SessionEndedHandler
    )
    .addRequestInterceptors(LocalizationInterceptor)
    .addErrorHandlers(ErrorHandler)
    .lambda();
