var scope;

var ackCallback;

var lplConfig = {
	context: function(moduleScope) {
		scope = moduleScope;
	},

	preparePayload: function(payload) {
		// 0x40 = request ACK
		return Buffer.concat([new Buffer([(0x00 | 0x80), payload.length + 3, 0x11, 0x64, 0x40]), payload], (payload.length + 5));
	},
	payloadSent: function(buffer, callback) {
		var timeout;

		ackCallback = function() {
			clearTimeout(timeout);
			// maybe go to standby first
			callback();
		};

		timeout = setTimeout(function() {
			if (scope.verbose) {
				console.log('retransmit');
			}
			timeout = null;
			scope.rfm69._attemptSend(buffer, callback);
		}, 1000);
		scope.receiveMode(function() {});
		return false;
	},
	handlePayload: function(payload, next) {
		var targetId = payload[0];
		var senderId = payload[1];
		var controlByte = payload[2];

		if (controlByte & 0x80) {
			// ack
			if (typeof ackCallback === 'function') {
				ackCallback();
			}
		}

		var message = payload.slice(3);
		if (scope.verbose) {
			console.log('message', message);
		}
		next({
			message: message,
			senderId: senderId,
			targetId: targetId
		});
	},

	registers: {
		0x01: parseInt('00000100', 2),
		0x02: parseInt('00000000', 2),
		0x03: parseInt('00000010', 2),
		0x04: parseInt('01000000', 2),
		0x05: parseInt('00000011', 2),
		0x06: parseInt('00110011', 2),
		0x07: 0xE4,
		0x08: 0xC0,
		0x09: 0x00,

		0x19: parseInt('01000010', 2),

		0x25: parseInt('01000000', 2),
		0x26: parseInt('00000111', 2),

		0x28: parseInt('00010000', 2),
		0x29: 220,

		0x2E: parseInt('10001000', 2),
		0x2F: 0x2D,
		0x30: 100,

		0x37: parseInt('10010000', 2),
		0x38: 66,

		0x3C: parseInt('10001111', 2),
		0x3D: parseInt('00010010', 2),

		0x5A: parseInt('01010101', 2),
		0x5C: parseInt('01110000', 2),

		0x6F: 0x30
	}
};

module.exports = lplConfig;
