var assert = require('assert');
var RFM69 = require('../index.js');

describe('End-to-End Testing (requires RFM69 module)', function() {

	describe('gut check', function() {
		it('loads', function() {
			assert(true);
		});
	});

	describe('initialization', function() {
		var rfm69;

		afterEach(function() {
			rfm69.close();
			rfm69 = undefined;
		});

		it('initializes', function(done) {
			var rfm69Options = {
				encryptionKey: "1234567890123456",
				highPower: true,
				nodeAddress: 1,
				broadcastAddress: 155,
				verbose: false,

				config: 'lowPowerLab'
			};

			rfm69 = new RFM69(rfm69Options);
			rfm69.onReady = function() {
				rfm69.listen();
				done();
			};
			rfm69.initialize();
		});
	});

});
