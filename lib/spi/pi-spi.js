// Mapping for pi-spi module

// 3rd party
var SPI = require('pi-spi');

var iface;

function initialize(bus, device) {
	iface = SPI.initialize('/dev/spidev' + bus + '.' + device);
}

function transfer(bytes, callback) {
	iface.transfer(bytes, bytes.length, callback);
}

module.exports = {
	initialize: initialize,
	transfer: transfer
};
