// See README.md for details.

// Load Mongoose OS API
load('api_gpio.js');
load('api_i2c.js');
load('api_rpc.js');
load('api_timer.js');
load('api_config.js');
load('api_aws.js');

let getTemp = ffi('float getTemp()');
let getHumidity = ffi('float getHumidity()');


let relayPin = 2; // GPIO pin which has a on/off relay connected
let freq = 60000; // Milliseconds. How often to send temperature readings to the cloud
let defaultTemp = 29; // Default target temp
let retryInterval = 100; // Retry interval for checking timers

GPIO.set_mode(relayPin, GPIO.MODE_OUTPUT);

function updateState(newSt) {
  if (newSt.on !== undefined) {
    state.on = newSt.on;
  }
}

let state = {
  targetTemp: defaultTemp,
  temp: 0,
  humidity:0,
  on: false
};

function applyHeater() {
  GPIO.write(relayPin, state.on || 0);
}

let getStatus = function() {

  let temp = getTemp();
  let humidity = getHumidity();

  if (temp <= 0 || temp > 1000 || humidity <= 0) {
      return undefined;
  }
  return {
    targetTemp: state.targetTemp,
    temp: temp,
    humidity: humidity,
    on: GPIO.read(relayPin) === 1
  };
};

RPC.addHandler('Heater.SetState', function(args) {
  GPIO.write(relayPin, args.on || 0);
  AWS.Shadow.update(0, {
    desired: {
      on: !state.on,
    },
  });
  return true;
});

RPC.addHandler('Heater.GetState', function(args) {
  return getStatus();
});

// Send temperature readings to the cloud
Timer.set(freq, Timer.REPEAT, function() {
  reportDeviceState();
}, null);

function reportDeviceState() {
    state = getStatus();
    while (state === undefined) {
        // Repeat read until valid
        Sys.usleep(retryInterval);
        state = getStatus();
    }
    print('Reporting state:', JSON.stringify(state));
    AWS.Shadow.update(0, state);
}

AWS.Shadow.setStateHandler(function(ud, ev, reported, desired) {
  print('Event:', ev, '('+AWS.Shadow.eventName(ev)+')');

  if (ev === AWS.Shadow.CONNECTED) {
    reportDeviceState();
    return;
  }

  print('Shadow Reported state:', JSON.stringify(reported));
  print('Shadow Desired state:', JSON.stringify(desired));

  // mOS will request state on reconnect and deltas will arrive on changes.
  if (ev !== AWS.Shadow.GET_ACCEPTED && ev !== AWS.Shadow.UPDATE_DELTA) {
    return;
  }

  // Here we extract values from previosuly reported state (if any)
  // and then override it with desired state (if present).
  updateState(reported);
  updateState(desired);

  print('New state:', JSON.stringify(state));

  applyHeater();

  if (ev === AWS.Shadow.UPDATE_DELTA) {
    // Report current state
    reportDeviceState();
  }
}, null);

applyHeater();
