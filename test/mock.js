// standard
var assert = require('assert');
// custom
var RFM69 = require('../lib/rfm69');

console.log('args', process.argv);

var registers = {};

var mockSPI = {
	initialize: function(bus, device) {
		// do nothing
	},
	transfer: function(bytes, callback) {
		if (bytes.length === 2) {
			// get or set registers
			var key = bytes[0] & parseInt('01111111', 2);
			var value = 0;
			if ((bytes[0] & parseInt('10000000', 2)) === parseInt('10000000', 2)) {
				// writing
				if (key === 0x01) {
					registers[0x27] = parseInt('00000000', 2);
				}
				registers[key] = bytes[1];
				if (key === 0x01) {
					registers[0x27] = parseInt('10000000', 2);
				}
			} else if ((bytes[0] & parseInt('10000000', 2)) === 0) {
				// reading
				value = registers[key] || 0;
			}
			callback(null, [key, value]);
		} else {
			callback('not implemented', null);
		}
	}
};

var mockGPIO = function(pin, pinMode, interruptOn) {
	this.unexport = function() {};
	this.unwatchAll = function() {};
};

describe('RFM69 Mock', function() {

	describe('gut check', function() {
		it('loads', function() {
			assert(true);
		});
	});

	describe('changing modes', function() {
		var base;

		before(function() {
			base = new RFM69(mockSPI, mockGPIO);
		});

		after(function() {
			base.cleanup();
		});

		it('enters standby mode', function(done) {
			base.detectMode(function(originalMode) {
				assert((originalMode & parseInt('00011100', 2)) !== parseInt('00000100', 2));
				base.standbyMode(function() {
					base.detectMode(function(newMode) {
						assert((newMode & parseInt('00011100', 2)) === parseInt('00000100', 2));
						done();
					});
				});
			});
		});

		it('enters receive mode', function(done) {
			base.detectMode(function(originalMode) {
				assert((originalMode & parseInt('00011100', 2)) !== parseInt('00010000', 2));
				base.receiveMode(function() {
					base.detectMode(function(newMode) {
						assert((newMode & parseInt('00011100', 2)) === parseInt('00010000', 2));
						done();
					});
				});
			});
		});
	});

});
