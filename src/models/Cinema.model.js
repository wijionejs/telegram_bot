const { Schema, model } = require('mongoose');

const CinemaModel = new Schema({
    uuid: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    location: {
        type: Schema.Types.Mixed,
    },
    url: {
        type: String,
        required: true,
    },
    films: {
        type: [String],
        default: [],
    },
});

module.exports = model('cinema', CinemaModel);