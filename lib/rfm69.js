var RFM69 = function(spiInterface, GpioInterface, receiveHandler, options, config) {
	var scope = this;

	options = options || {};

	var spi = spiInterface;
	this.receiveHandler = receiveHandler;
	this.interruptListeners = {};

	var spiBus = options.spiBus || 0;
	var spiDevice = options.spiDevice || 0;
	this.verbose = options.verbose || false;
	this.interruptPin = new GpioInterface(options.interruptPin || 25, 'in', 'rising');
	this.resetPin = new GpioInterface(options.resetPin || 24, 'out');
	this.config = config;

	var moduleRegisters = {};
	var registers = {};

	this._initialize = function() {
		spi.initialize(spiBus, spiDevice);
	};
	this._setRegister = function(key, value, type) {
		if (type === 'module') {
			moduleRegisters[key] = value;
		} else {
			registers[key] = value;
		}
	};
	this._readRegister = function(key) {
		return registers[key];
	};
	this._getRegisters = function() {
		var newConfig = JSON.parse(JSON.stringify(moduleRegisters));  // to copy
		// Apply configuration registers
		for (var key1 in this.config.registers) {
			newConfig[key1] = this.config.registers[key1];
		}
		// Apply custom registers
		for (var key2 in registers) {
			newConfig[key2] = registers[key2];
		}
		return newConfig;
	};
	this._transfer = function(buffer, callback) {
		spi.transfer(buffer, callback);
	};
};

// Configuration functions
RFM69.prototype.setOpMode = function(mode) {
	this._setRegister(REG_OP_MODE, mode);
};
RFM69.prototype.setDataModulation = function(modulation) {
	this._setRegister(REG_DATA_MODULATION, modulation);
};
RFM69.prototype.setSyncValue = function(value) {
	var bytes = new Buffer([
		0x01, 0x01, 0x01, 0x01,
		0x01, 0x01, 0x01, 0x01
	]);
	if (value) {
		bytes.write(value, 0, value.length);
	}
	for (var i = 0; i < bytes.length; i++) {
		this._setRegister((REG_SYNC_VALUE_1 + i), bytes[i]);
	}
};
RFM69.prototype.setNodeAddress = function(address) {
	if (address > 255) {
		throw new Error('Node Address cannot be greater than 255');
	}
	this._setRegister(REG_NODE_ADDRESS, address);
};
RFM69.prototype.setBroadcastAddress = function(address) {
	if (address > 255) {
		throw new Error('Broadcast Address cannot be greater than 255');
	}
	this._setRegister(REG_BROADCAST_ADDRESS, address);
};
RFM69.prototype.setEncryptionKey = function(key, callback) {
	var scope = this;

	var bytes = new Buffer([
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	]);
	if (key) {
		// 3E through 4D
		bytes.write(key, 0, key.length);
		this._setRegister(REG_PACKET_CONFIG_2, 1);
	}
	for (var i = 0; i < bytes.length; i++) {
		this._setRegister((REG_AES_KEY_1 + i), bytes[i]);
	}
};
RFM69.prototype.setHighPower = function(highPower) {
	this._setRegister(REG_OCP, 0x0F);
	var level = this._readRegister(REG_PA_LEVEL);
	var newLevel = (level & 0x1F) | 0x40 | 0x20;
	this._setRegister(REG_PA_LEVEL, newLevel);
};
RFM69.prototype.setFrequency = function(frequency) {
	if (!FREQUENCIES[frequency]) {
		throw new Error('Frequency not supported');
	}

	this._setRegister(REG_FREQ_MSB, FREQUENCIES[frequency][0]);
	this._setRegister(REG_FREQ_MID, FREQUENCIES[frequency][1]);
	this._setRegister(REG_FREQ_LSB, FREQUENCIES[frequency][2]);
};

// Act on the module
RFM69.prototype.reset = function(callback) {
	// pull high for 100 us
	// set back to low
	// module ready after 5 ms
	var scope = this;
	this.resetPin.write(1, function resetHighCallback(err) {
		setTimeout(function resetTimeoutCallback() {
			scope.resetPin.write(0, function resetLowCallback(err) {
				setTimeout(callback, 5);
			});
		}, 1);
	});
};
RFM69.prototype.setInterrupt = function(enable) {
	var scope = this;
	if (enable) {
		this.interruptPin.watch(function interruptWatchCallback(err, value) {
			if (err) {
				console.error('interrupt error', err);
				throw err;
			}
			if (value === 1) {
				scope.interrupted(value);
			} else {
				console.warn('Got unexpected interrupt value', value, err);
			}
		});
		if (scope.verbose) {
			console.log('interrupt enabled');
		}
	} else {
		this.interruptPin.unwatchAll();
		if (scope.verbose) {
			console.log('interrupt disabled');
		}
	}
};
RFM69.prototype.cleanup = function() {
	if (this.verbose) {
		console.log('cleaning up');
	}
	this.interruptPin.unwatchAll();
	this.interruptPin.unexport();
	this.resetPin.unexport();
};

// Module communication
RFM69.prototype.initialize = function() {
	this._initialize();
};
RFM69.prototype.configure = function(callback) {
	var scope = this;
	var registers = this._getRegisters();

	var registerCount = Object.keys(registers).length;
	var i = 0;
	for (var key in registers) {
		if (!registers.hasOwnProperty(key)) {
			continue;
		}
		this.setRegister(parseInt(key), registers[key], function configRegisterSetCallback(e, d) {
			i++;
			if (e) {
				console.error('error configuring register', e);
			}

			if (i >= registerCount) {
				if (scope.verbose) {
					console.log('all configured', i);
				}
				callback();
			}
		});
	}
};
RFM69.prototype.loadRegistersFromModule = function(callback) {
	var registers = this._getRegisters();

	var registerCount = Object.keys(registers).length;
	if (registerCount < 1) {
		console.warn('nothing to do because the register count is 0');
		callback();
	}
	var i = 0;
	for (var key in registers) {
		if (!registers.hasOwnProperty(key)) {
			continue;
		}
		this.loadRegisterValue(parseInt(key), function loadRegisterCallback() {
			i++;
			if (i >= registerCount) {
				callback();
			}
		});
	}
};
RFM69.prototype.loadRegisterValue = function(key, callback) {
	var scope = this;
	this.readRegister(key, function(e, d) {
		if (e) {
			console.error('Error loading register value', e);
		}
		scope._setRegister(key, d[1], 'module');
		callback();
	});
};
RFM69.prototype.verifySync = function(callback) {
	var scope = this;
	scope.setRegister(REG_SYNC_VALUE_1, 0xAA, function syncSetFirstRegisterCallback(err, data) {
		scope.readRegister(REG_SYNC_VALUE_1, function syncReadFirstRegisterCallback(err, data) {
			if (data[1] === 0xAA) {
				scope.setRegister(REG_SYNC_VALUE_1, 0x55, function syncSetSecondRegisterCallback(err, data) {
					scope.readRegister(REG_SYNC_VALUE_1, function syncReadSecondRegisterCallback(err, data) {
						if (data[1] === 0x55) {
							callback(true);
						} else {
							console.warn('sync did not complete');
						}
					});
				});
			}
		});
	});
};

RFM69.prototype.changeMode = function(desiredMode, callback) {
	var scope = this;
	scope.detectMode(function changeModeDetectCallback(currentMode) {
		if (scope.verbose) {
			console.log('mode detected', currentMode);
		}
		var newMode = (currentMode & parseInt('11100011', 2)) | desiredMode;
		scope.setRegister(REG_OP_MODE, newMode, function changeModeSetRegisterCallback(err, data) {
			if (err) {
				console.error('Error setting mode register', newMode, err);
			}
			callback(err, data);
		});
	});
};
RFM69.prototype.standbyMode = function(callback) {
	var scope = this;
	this.changeMode(parseInt('00000100', 2), function changeToStandbyCallback(err, data) {
		if (err) {
			console.error('Unable to switch to standby mode', err);
		} else {
			if (scope.verbose) {
				console.log('switched to standby mode');
			}
		}
		callback(err, data);
	});
};
RFM69.prototype.transmitMode = function(callback) {
	var scope = this;
	this.changeMode(parseInt('00001100', 2), function changeToTransmitCallback(err, data) {
		if (err) {
			console.error('Unable to switch to transmit mode', err);
			callback(err, data);
		} else {
			if (scope.verbose) {
				console.log('switched to transmit mode');
			}
			scope.powerLevel(true, function changeToTransmitPowerLevelCallback(err, data) {
				if (err) {
					console.error('Failed to set power level when switching to transmit mode', err);
				}
				callback(err, data);
			});
		}
	});
};
RFM69.prototype.receiveMode = function(callback) {
	var scope = this;
	if (scope.verbose) {
		console.log('switching to receive mode');
	}
	this.changeMode(parseInt('00010000', 2), function changeToReceiveCallback(err, data) {
		if (err) {
			console.error('Unable to switch to receive mode', err);
			callback(err, data);
		} else {
			if (scope.verbose) {
				console.log('switched to receive mode');
			}
			scope.powerLevel(false, function changeToReceivePowerLevelCallback(err, data) {
				if (err) {
					console.error('Failed to set power level when switching to receive mode', err);
				}
				callback(err, data);
			});
		}
	});
};
RFM69.prototype.detectMode = function(callback) {
	var scope = this;
	scope.readRegister(REG_OP_MODE, function detectModeCallback(e, d) {
		if (e) {
			console.error('Error detecting mode', e);
		}
		callback(d[1]);
	});
};

RFM69.prototype.doAfterReady = function(todo) {
	var scope = this;
	setTimeout(function() {
		scope.readRegister(REG_IRQ_FLAGS_1, function doAfterReadyReadCallback(err, data) { // 0x27
			if (err) {
				console.error('Problem while checking ready state', err);
			} else {
				if ((data[1] & parseInt('10000000', 2)) === parseInt('10000000', 2)) {
					//ready
					todo();
				} else {
					// not ready yet
					scope.doAfterReady(todo);
				}
			}
		});
	}, 100);
};
RFM69.prototype.doAfterInterrupt = function(state, todo) {
	if (!this.interruptListeners[state]) {
		this.interruptListeners[state] = [];
	}
	this.interruptListeners[state].push(todo);
};
RFM69.prototype.powerLevel = function(high, callback) {
	var pa1, pa2;
	var scope = this;
	if (high) {
		pa1 = parseInt('01011101', 2); // 0x5D
		pa2 = parseInt('01111100', 2); // 0x7C
	} else {
		pa1 = parseInt('01010101', 2); // 0x55
		pa2 = parseInt('01110000', 2); // 0x70
	}
	this.setRegister(REG_TEST_PA_1, pa1, function setPowerLevelFirstRegisterCallback(err, data) { // 0x5A
		if (err) {
			console.error('Unable to set first power level register', err);
			callback(err, data);
		} else {
			scope.setRegister(REG_TEST_PA_2, pa2, function setPowerLevelSecondRegisterCallback(err, data) { // 0x5C
				if (err) {
					console.error('Unable to set second power level register', err);
				}
				callback(err, data);
			});
		}
	});
};
RFM69.prototype.enableReception = function(callback) {
	var scope = this;
	this.readRegister(REG_IRQ_FLAGS_2, function enableReceptionReadCallback(err, data) { // 0x28
		if (err) {
			console.error('Error reading buffer state before enabling reception', err);
		}
		if (data[1] & 0x04) {
			console.warn('payload ready while enabling reception');
		}
		scope.setRegister(REG_DIO_MAPPING_1, 0x40, function enableReceptionSetCallback(err, data) { // 0x25
			if (err) {
				console.error('Error setting reg before enabling reception', err);
			}
			scope.receiveMode(function enableReceptionReceiveModeCallback(err, data) {
				callback(err, data);
			});
		});
	});
};

var payloadHandled = function(payload) {
	if (payload) {
		this.receiveHandler(payload);
	}
	this.receiveMode(function() {});
};
RFM69.prototype.interrupted = function(value) {
	var scope = this;
	if (scope.verbose) {
		console.log('interrupted', value);
	}
	this.readRegister(REG_IRQ_FLAGS_2, function interruptedReadCallback(err, data) { // 0x28
		if (scope.verbose) {
			console.log('interrupt read', err, data);
		}
		if (err) {
			console.error('Error reading after interrupt', err);
		} else if (data[1] & 0x08) {
			if (scope.verbose) {
				console.log('Packet Sent');
			}
			if (scope.interruptListeners[0x08]) {
				scope.interruptListeners[0x08].forEach(function interruptedSendListenerCallback(listener) {
					listener();
				});
				if (scope.verbose) {
					console.log('done with Packet Sent listeners');
				}
				scope.interruptListeners[0x08] = [];
			}
		} else if (data[1] & 0x04) {
			if (scope.verbose) {
				console.log('Payload Ready');
			}
			if (scope.interruptListeners[0x04]) {
				scope.interruptListeners[0x04].forEach(function interruptedReadListenerCallback(listener) {
					listener();
				});
				if (scope.verbose) {
					console.log('done with Payload Ready listeners');
				}
				scope.interruptListeners[0x04] = [];
			}
			scope.standbyMode(function standbyAfterReadInterruptCallback(err, data) {
				if (err) {
					console.error('Error switching to standby mode after receiving read interrupt', err);
					return;
				}
				// do all this stuff to read payload data
				var headerBuffer = Buffer([(REG_FIFO & 0x7F), 0]);
				scope._transfer(headerBuffer, function readInterruptReadHeadersCallback(err, headerData) {
					if (err) {
						console.error('Error reading payload headers', err);
						return;
					}
					var payloadLength = headerData[1];
					var payload = [(REG_FIFO & 0x7F)];
					for (var i = 0; i < payloadLength; i++) {
						payload.push(0);
					}
					var payloadBuffer = Buffer(payload);
					scope._transfer(payloadBuffer, function readInterruptReadPayloadCallback(err, payloadData) {
						if (err) {
							console.error('Error reading payload body', err);
							return;
						}
						var workingPayload = payloadData.slice(1);

						if (scope.verbose) {
							console.log('payload received by rfm69', workingPayload);
						}

						if (scope.config.handlePayload) {
							scope.config.handlePayload(workingPayload, function(err, modifiedPayload) {
								payloadHandled(modifiedPayload);
							});
						} else {
							if (scope.verbose) {
								console.log('no payload handler');
							}
							payloadHandled(workingPayload);
						}
					});
				});
			});
		} else {
			console.warn('Not sure what to do with this payload', data);
			scope.receiveMode(function() {}); // just in case
		}
	});
};
RFM69.prototype.send = function(buffer, callback) {
	var scope = this;
	scope.detectMode(function sendDetectModeCallback(originalMode) {
		originalMode = (originalMode & parseInt('00011100', 2));
		if (scope.verbose) {
			console.log('Original Mode detected', originalMode);
		}
		var payload = scope.config.preparePayload(buffer);
		if (scope.verbose) {
			console.log('Going to transfer', payload);
		}
		scope._attemptSend(payload, function sendAttemptCallback(err, data) {
			if (err) {
				if (scope.verbose) {
					console.error('Error sending to mote', err);
				}
			} else {
				if (scope.verbose) {
					console.log('send complete');
				}
			}
			scope.changeMode(originalMode, function changeModeAfterSendCallback(err, data) {
				if (err) {
					console.error('Could not switch back to Original Mode after send attempt', err);
				} else {
					if (scope.verbose) {
						console.log('Reset to Original Mode', originalMode);
					}
				}
				callback(err, data);
			});
		});
	});
};
RFM69.prototype._attemptSend = function(payload, callback) {
	var scope = this;
	scope.standbyMode(function standbyBeforeSendCallback(err, data) {
		if (err) {
			console.error('Send attempt failed when switching to standby mode', err);
			// should probably revert standby mode
			callback(err, data);
		} else {
			scope.doAfterReady(function sendAfterStandbyModeCallback() {
				// Set the DIOx Mapping so the interrupt means "PacketSent" once switched to Transmit Mode (pg 48)
				scope.setRegister(REG_DIO_MAPPING_1, 0x00, function sendSetRegisterCallback(err, data) { // 0x25
					if (err) {
						console.error('Error setting DIO Mapping before send', err);
						// should probably revert the setup we've done
						callback(err, data);
					} else {
						scope._transfer(payload, function sendTransferCallback(error, data) {
							if (error) {
								console.error('Send attempt failed while transferring', error);
								callback(error, data);
							} else {
								if (scope.verbose) {
									console.log('transferred', payload, 'and got', data);
								}
								var sentTimeout = setTimeout(function postSendInterruptTimeoutCallback() {
									console.warn('send timed out', payload, data);
									sentTimeout = null;
									callback(new Error('Send timed out'));
									scope.interruptListeners[0x04] = [];
									scope.interruptListeners[0x08] = [];
								}, 2000);
								scope.doAfterInterrupt(0x08, function sendInterruptCallback() {
									if (scope.verbose) {
										console.log('send attempt post interrupt');
									}
									clearTimeout(sentTimeout);
									sentTimeout = null;

									scope.standbyMode(function standbyAfterSendInterruptCallback(err, data) {
										if (err) {
											console.error('Error switching to standby mode after send interrupt');
										}
										if (typeof scope.config.payloadSent === 'function') {
											if (scope.verbose) {
												console.log('custom payload handler');
											}
											scope.config.payloadSent(payload, callback);
										}

										// Set the DIOx Mapping so the interrupt means "PayloadReady" once switched to Receive Mode (pg 48)
										scope.setRegister(REG_DIO_MAPPING_1, 0x40, function sendSetRegisterCallback(err, data) { // 0x25
											if (err) {
												console.error('Error setting DIO Mapping after send', err);
											}
											scope.receiveMode(function(err, data) {
												if (err) {
													console.error('Failed while switching to receive mode after transmit', err);
												} else {
													if (scope.verbose) {
														console.log('Switched to receive mode after transmit');
													}
												}
											});
										});
									});
								});
								scope.transmitMode(function sendTransmitModeCallback(err, data) {
									if (err) {
										console.error('Send attempt failed while switching to transmit mode', err);
									} else {
										if (scope.verbose) {
											console.log('transmit initiated');
										}
									}
								});
							}
						});
					}
				});
			});
		}
	});
};

RFM69.prototype.readRegister = function(address, callback) {
	var scope = this;
	var buffer = Buffer([(address & 0x7F), 0]);
	this._transfer(buffer, function readRegisterTransferCallback(e, d) {
		if (e) {
			console.error('Error reading register', e);
		}
		if (scope.verbose) {
			console.log('register read', address.toString(16), '=>', d[1].toString(2));
		}
		if (typeof callback !== 'function') {
			console.error('not a callback', address, callback);
		} else {
			callback(e, d);
		}
	});
};
RFM69.prototype.setRegister = function(address, value, callback) {
	var scope = this;
	var buffer = Buffer([(address | 0x80), value]);
	this._transfer(buffer, function setRegisterTransferCallback(e, d) {
		if (e) {
			console.error('Error setting register', e);
		}
		if (scope.verbose) {
			console.log('register write', address.toString(16), '=>', value.toString(2), '(was', d[1].toString(2),')');
		}
		if (typeof callback !== 'function') {
			console.error('not a callback', address.toString(16), value, callback);
		} else {
			callback(e, d);
		}
	});
};

module.exports = RFM69;


// Constants
var FREQUENCIES = {
        /* MSB   MID   LSB */
    433: [0x6C, 0x40, 0x00],
    868: [0xD9, 0x00, 0x00],
    915: [0xE4, 0xC0, 0x00]
}

var REG_FIFO              = 0x00;
var REG_OP_MODE           = 0x01;
var REG_DATA_MODULATION   = 0x02;
var REG_FREQ_MSB          = 0x07;
var REG_FREQ_MID          = 0x08;
var REG_FREQ_LSB          = 0x09;
var REG_PA_LEVEL          = 0x11;
var REG_OCP               = 0x13;
var REG_DIO_MAPPING_1     = 0x25;
var REG_IRQ_FLAGS_1       = 0x27;
var REG_IRQ_FLAGS_2       = 0x28;
var REG_SYNC_VALUE_1      = 0x2F;
var REG_NODE_ADDRESS      = 0x39;
var REG_BROADCAST_ADDRESS = 0x3A;
var REG_PACKET_CONFIG_2   = 0x3D;
var REG_AES_KEY_1         = 0x3E;
var REG_TEST_PA_1         = 0x5A;
var REG_TEST_PA_2         = 0x5C;

// OP MODE
var MODE_SLEEP      = 0x00;
var MODE_STANDBY    = 0x04;
var MODE_FREQ_SYNTH = 0x08;
var MODE_TRANSMIT   = 0x0C;
var MODE_RECEIVE    = 0x10;

// DATA MODULATION
var DATA_MODE_PACKET             = 0x00;
var DATA_MODE_CONTINUOUS_SYNCHED = 0x40;
var DATA_MODE_CONTINUOUS         = 0x60;
var MODULATION_TYPE_FSK          = 0x00;
var MODULATION_TYPE_OOK          = 0x08;
var MODULATION_SHAPING_NONE      = 0x00;
var MODULATION_SHAPING_A         = 0x01;
var MODULATION_SHPAING_B         = 0x02;
var MODULATION_SHAPING_C         = 0x03;

var defaultRegisters = {
	0x00: 0x00,
	0x01: parseInt('00000100', 2),
	0x02: parseInt('00000000', 2),
	0x03: 0x1A,
	0x04: 0x0B,
	0x05: parseInt('00000000', 2),
	0x06: 0x52,
	0x07: 0xE4,
	0x08: 0xC0,
	0x09: 0x00,
	0x0A: parseInt('01000001', 2),
	0x0B: parseInt('00000000', 2),
	0x0C: 0x02,
	0x0D: parseInt('10010010', 2),
	0x0E: 0xF5,
	0x0F: 0x20,
	0x10: 0x24,
	0x11: parseInt('10011111', 2),
	0x12: parseInt('00001001', 2),
	0x13: parseInt('00011010', 2),
	0x14: 0x40,
	0x15: 0xB0,
	0x16: 0x7B,
	0x17: 0x9B,
	0x18: parseInt('10001000', 2),
	0x19: parseInt('01010101', 2),
	0x1A: parseInt('10001011', 2),
	0x1B: parseInt('01000000', 2),
	0x1C: parseInt('10000000', 2),
	0x1D: parseInt('00000110', 2),
	0x1E: parseInt('00010000', 2),
	0x1F: 0x00,
	0x20: 0x00,
	0x21: 0x00,  // ?
	0x22: 0x00,  // ?
	0x23: parseInt('00000010', 2),
	0x24: 0xFF,
	0x25: parseInt('00000000', 2),
	0x26: parseInt('00000111', 2),
	0x27: parseInt('10000000', 2),
	0x28: parseInt('00000000', 2),
	0x29: 0xE4,
	0x2A: 0x00,
	0x2B: 0x00,
	0x2C: 0x00,
	0x2D: 0x03,
	0x2E: parseInt('10011000', 2),
	0x2F: 0x01,
	0x30: 0x01,
	0x31: 0x01,
	0x32: 0x01,
	0x33: 0x01,
	0x34: 0x01,
	0x35: 0x01,
	0x36: 0x01,
	0x37: parseInt('00010000', 2),
	0x38: 0x40,
	0x39: 0x00,
	0x3A: 0x00,
	0x3B: parseInt('00000000', 2),
	0x3C: parseInt('10001111', 2),
	0x3D: parseInt('00000010', 2),
	0x3E: 0x00,
	0x3F: 0x00,
	0x40: 0x00,
	0x41: 0x00,
	0x42: 0x00,
	0x43: 0x00,
	0x44: 0x00,
	0x45: 0x00,
	0x46: 0x00,
	0x47: 0x00,
	0x48: 0x00,
	0x49: 0x00,
	0x4A: 0x00,
	0x4B: 0x00,
	0x4C: 0x00,
	0x4D: 0x00,

	0x4E: parseInt('00000001', 2),
	0x4F: 0x00,  // ?

	0x58: 0x1B,
	0x5A: 0x55,
	0x5C: 0x70,
	0x6F: 0x30,
	0x71: 0x00
};
