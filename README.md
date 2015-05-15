# rfm69

Node module for interfacing with HopeRF RFM69 modules on a Raspberry Pi.

This module has only been tested on a Raspberry Pi Model B running NodeJS 0.10.28. The module will likely work with other Pis and version of NodeJS, but they have not been officially tested.

Support for other systems (e.g. BeagleBoard) will be considered.

## Installation

```
npm install rfm69
```

If you haven't already enabled SPI on your Raspberry Pi, you'll need to [enable the SPI kernel module](http://scruss.com/blog/2013/01/19/the-quite-rubbish-clock/#spi).

You'll also need to run your Node project with `sudo` in order to have permission to access the SPI interface. You may be able to modify permissions on your Pi to eliminate the need for `sudo`, but that has not been tested ([more info](https://github.com/natevw/pi-spi#example)). Install all your npm packages without `sudo` (or however you normally do it). Just use `sudo` to run the project.


## Usage

```js
var RFM69 = require('rfm69');

// configure a module
var rfm69 = new RFM69();

rfm69.onReady = function() {
	// module initialized
	rfm69.listen();  // can receive
	rfm69.send("hi");
};
rfm69.onMessage = function(buffer) {
	console.log('received message', buffer);
};

// start up the module
rfm69.initialize();

// clean up on shutdown
process.on('SIGINT', function() {
	rfm69.close();
	process.exit();
});
```

### RFM69([config])

Create a new instance of an rfm69 module (you can have two wired up).

Optionally takes a configuration object with the following optional parameters:
- `encryptionKey` string, used as key for encrypting messages. Omitting the encryption key disables encryption (default).
- `highPower` boolean, whether or not module is a high power variant (e.g. rfm69HW) (default: `false`)
- `nodeAddress`: int, unique identifier for this transceiver in the group (no default)
- `broadcastAddress` int, signifies the group of RF transceivers this module belongs to (no default)
- `spiBus` int, bus the RF module is wired to (default: `0` - only option on Pi Model B)
- `spiDevice` int, which device the RF module is wired as on the SPI bus (default: `0`)
- `interruptPin` int, which GPIO pin is wired to DIO0 on the RF module (default: `25`)
- `resetPin` int, which GPIO pin is wired to RESET on the RF module (default: `24`)
- `config` string, which message profile to use. Can be `default` or `lowPowerLab` (default: `default`)
- `verbose` boolean, extended logging (default: `false`)

```
var config = {
	encryptionKey: "sampleEncryptKey",
	highPower: true,
	nodeAddress: 1,
	broadcastAddress: 155,
	verbose: false,
	config: 'lowPowerLab'
};

var rfm69 = new RFM69(config)
```

#### initialize()

Turn on the RF module and apply its configuration

#### listen()

Tell the module to notify you of incoming messages.

#### send(string, callback)

Send a series of characters over the RF module. Callback function will be called when the message has been sent. Callback will be passed an error argument if an error is encountered during the send.

#### reset()

Reapply the module's configuration according to the options provided at instantiation.

#### close()

Disable the RF module and allow the interrupt and reset GPIO pins to be used for other purposes.

## Message Profiles

Message profiles allow the RF module to communicate with other RF modules that follow specific message format standards.

The `default` profile sends exactly the outgoing message you specify and provides the full message body when an incoming message is received.

The `lowPowerLab` profile formats outgoing messages in accordance with the [Arduino libraries provided by LowPowerLab](https://github.com/LowPowerLab/RFM69), allowing the Raspberry Pi to communicate with the [LowPowerLab Moteino](http://lowpowerlab.com/moteino/) and provide message filtering and message retries. *Not yet configured to ACK messages from a Moteino*.

Other profiles can be developed an added with a pull-request.
