var scope;

var defaultConfig = {
	context: function(moduleScope) {
		scope = moduleScope;
	},

	preparePayload: function(payload) {
		return payload;
	},
	payloadSent: function(payload, callback) {
		return true;
	},
	handlePayload: function(payload) {
		return payload;
	},

	registers: {}
};

module.exports = defaultConfig;
