const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
    telegramId: {
        type: Number
    },
    films: {
        type: [String]
    },
});

module.exports = model('User', UserSchema);