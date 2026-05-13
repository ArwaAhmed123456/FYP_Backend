const mongoose = require('mongoose');

const VoiceLogSchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: false
    },
    transcript: {
        type: String,
        required: true
    },
    normalizedTranscript: {
        type: String
    },
    intent: {
        type: String
    },
    target: {
        type: String
    },
    confidence: {
        type: Number
    },
    source: {
        type: String,
        enum: ['local', 'quick', 'llm', 'cache']
    },
    latency: {
        type: Number
    },
    screen: {
        type: String
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('VoiceLog', VoiceLogSchema);
