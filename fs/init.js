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


let relayPin = 12; // GPIO pin which has a on/off relay connected
let freq = 2000; // Milliseconds. How often to send temperature readings to the cloud when on

GPIO.set_mode(relayPin, GPIO.MODE_OUTPUT);

function updateState(newSt) {
  if (newSt.on !== undefined) {
    state.on = newSt.on;
  }
  if (newSt.targetTemp !== undefined) {
    state.targetTemp = newSt.targetTemp;
  }
}

let state = {
  targetTemp: 0,
  temp: 0,
  humidity:0,
  on: false,
  heaterOn: false,
};

function applyThermostat() {
  if (state.on) {
    // use a buffer zone of 1 degree to switch on
    if (state.temp < state.targetTemp - 1) {
        state.heaterOn = true;
    } else if (state.temp >= state.targetTemp) {
        state.heaterOn = false;
    }
  }
  else {
    // device state is off, so switch off heater
    state.heaterOn = false;
  }
  // switch heater relay on/off
  GPIO.write(relayPin, state.heaterOn || 0);
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
    on: state.on,
    heaterOn: GPIO.read(relayPin) === 1
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
  // only start reporting when device is turned on
  if (state.on) {
    reportDeviceState();
  }
}, null);

function reportDeviceState() {
    state = getStatus();
    while (state === undefined) {
        // Repeat read every 100ms until valid
        Sys.usleep(100);
        state = getStatus();
    }

    // apply thermostatic control
    applyThermostat();

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

  applyThermostat();

  if (ev === AWS.Shadow.UPDATE_DELTA) {
    // Report current state
    reportDeviceState(ev);
  }
}, null);
