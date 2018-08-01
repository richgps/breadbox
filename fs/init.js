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

// GPIO pin which has a on/off relay connected
let relayPin = 2;
GPIO.set_mode(relayPin, GPIO.MODE_OUTPUT);

//target temperature
let targetTemperature = 28;

function updateState(newSt) {
  if (newSt.on !== undefined) {
    state.on = newSt.on;
  }
}

function applyHeater() {
  GPIO.write(relayPin, state.on || 0);
}

// Milliseconds. How often to send temperature readings to the cloud
let freq = 60000;

// sets a new target temp
let setTargetTemp = function(newTarget) {
};


let state = {
  on: false,
  humidity: getHumidity(),
  temp: getTemp(),
  targetTemp: targetTemperature
};

let getStatus = function() {
  return {
    temp: getTemp(),
    humidity: getHumidity(),
    on: GPIO.read(relayPin) === 1,
    targetTemp: targetTemperature
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
  state = getStatus();
  reportState();
}, null);

function reportState() {
  print('Reporting state:', JSON.stringify(state));
  AWS.Shadow.update(0, state);
}

AWS.Shadow.setStateHandler(function(ud, ev, reported, desired) {
  print('Event:', ev, '('+AWS.Shadow.eventName(ev)+')');

  if (ev === AWS.Shadow.CONNECTED) {
    reportState();
    return;
  }

  print('Reported state:', JSON.stringify(reported));
  print('Desired state:', JSON.stringify(desired));

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
    reportState();
  }
}, null);

applyHeater();
