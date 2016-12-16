var scope;

var ackCallback;
var counter = {};

var sendAck = function(target, callback) {
	var buffer = new Buffer([(0x00 | 0x80), 3, target, 0x64, 0x80]);
	if (scope.rfm69.verbose) {
		console.log('sending ACK to', target, buffer);
	}
	scope.rfm69._attemptSend(buffer, function(err, data) {
		console.log('ACK sent', err, data);
		callback(err, data);
	});
};

var lplConfig = {
	context: function(moduleScope) {
		scope = moduleScope;
	},

	preparePayload: function(payload) {
		// 0x11 = target (hard coded for now)
		// 0x64 = sender (hard coded for now)
		// 0x40 = request ACK
		return Buffer.concat([new Buffer([(0x00 | 0x80), payload.length + 3, 0x11, 0x64, 0x40]), payload], (payload.length + 5));
	},
	payloadSent: function(buffer, callback) {
		var timeout;

		var key = buffer.toString();
		if (!counter[key]) {
			counter[key] = 0;
		}

		ackCallback = function() {
			clearTimeout(timeout);
			delete counter[key];
			// maybe go to standby first
			callback();
		};

		timeout = setTimeout(function lowPowerLabSendTimeout() {
			if (scope.rfm69.verbose) {
				console.log('timed out');
			}
			timeout = null;

			counter[key]++;
			if (counter[key] === 5) {
				//stop trying
				delete counter[key];
				callback(new Error('Max retry limit reached while trying to send message: ' + key));
			} else {
				if (scope.rfm69.verbose) {
					console.log('retransmitting');
				}
				scope.rfm69._attemptSend(buffer, callback);
			}
		}, 1000);
		return false;
	},
	handlePayload: function(payload, callback) {
		if (scope.rfm69.verbose) {
			console.log('handling payload', payload);
		}
		var targetId = payload[0];
		var senderId = payload[1];
		var controlByte = payload[2];

		if (controlByte & 0x80) {
			// ack
			console.log('ACKed');
			if (typeof ackCallback === 'function') {
				ackCallback();
			}
			return;  // no need to proceed. The ACK is taken care of
			callback(null, payload);
		} else if (controlByte & 0x40) {
			// wants an ACK
			console.log('should ACK');
			sendAck(senderId, function(err, data) {
				if (err) {
					callback(err, null);
					return;
				}

				var message = payload.slice(3);
				if (scope.rfm69.verbose) {
					console.log('message', message);
				}
				var data = {
					message: message,
					senderId: senderId,
					targetId: targetId
				};
				callback(null, data);
			});
		}
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
