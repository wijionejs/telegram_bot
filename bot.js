require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const http = axios.create({
    timeout: 500,
});

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.BOT_API_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

// Matches "/echo [whatever]"
bot.onText(/\/sites_condition/, async (msg) => {

    const chatId = msg.chat.id;

    try {
        const { data } = await http.get('https://www.thpanorama.com/');
        const message = data.includes('<title>Thpanorama') ?
            'If-koubou is available' :
            'If-koubou is not available';

        bot.sendMessage(chatId, message);
    } catch (e) {
        bot.sendMessage(chatId, 'If-koubou is not available');
    }

    // send back the matched "whatever" to the chat
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
    // console.log(msg);
    const chatId = msg.chat.id;

    // send a message to the chat acknowledging receipt of their message
    bot.sendMessage(chatId, 'Received your message');
});

bot.on('callback_query', (query) => {

});