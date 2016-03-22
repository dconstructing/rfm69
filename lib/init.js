// 3rd party
var GPIO = require('onoff').Gpio;
var RFM69 = require('./rfm69');
// custom
var piSpi = require('./spi/pi-spi');

var RFM69Accessor = function(options) {
	var scope = this;
	this.ready = false;
	this.listening = false;

	if (!options.config) {
		options.config = 'default';
	}
	var config = require('./configurations/' + options.config);
	if (config.context && typeof config.context === 'function') {
		config.context(scope);
	}

	this._configure = function() {
		var scope = this;
		scope.rfm69.loadRegistersFromModule(function() {
			scope.rfm69.setEncryptionKey(options.encryptionKey);
			scope.rfm69.setHighPower(options.highPower);
			if (options.nodeAddress) {
				scope.rfm69.setNodeAddress(options.nodeAddress);
			}
			if (options.broadcastAddress) {
				scope.rfm69.setBroadcastAddress(options.broadcastAddress);
			}
			if (options.frequency) {
				scope.rfm69.setFrequency(options.frequency);
			}
			scope.rfm69.configure(function() {
				scope.rfm69.doAfterReady(function() {
					scope.ready = true;
					scope.onReady();
				});
			});
		});
	};
	this.onReady = function() {
		console.log('ready listener not defined');
	};
	this.onMessage = function(buffer, callback) {
		console.log('message handler not defined');
		callback();
	};

	var receiveHandler = function(buffer) {
		scope.onMessage(buffer, function() {});
	};

	this.rfm69 = new RFM69(piSpi, GPIO, receiveHandler, options, config);
};
RFM69Accessor.prototype.initialize = function() {
	this.rfm69.initialize();
	this.reset();
};
RFM69Accessor.prototype.listen = function() {
	var scope = this;
	this.rfm69.setInterrupt(true);
	this.rfm69.enableReception(function() {
		scope.listening = true;
		console.log('rfm69 listening');
	});
};
RFM69Accessor.prototype.send = function(message, callback) {
	var scope = this;
	scope.listening = false;
	this.rfm69.send(new Buffer(message), function(err, data) {
		if (err) {
			console.error('Error sending to mote', err);
		} else {
			console.log('sent to mote', data);
		}
		scope.listening = true;
		callback(err, data);
	});
};
RFM69Accessor.prototype.reset = function() {
	this.ready = false;
	this.rfm69.reset(this._configure.bind(this));
};
RFM69Accessor.prototype.close = function() {
	this.rfm69.cleanup();
	this.rfm69 = undefined;
};

module.exports = RFM69Accessor;
