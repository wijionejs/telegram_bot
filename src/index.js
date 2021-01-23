require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const helpers = require('./helpers');

helpers.logStart();

const token = process.env.BOT_API_TOKEN;

const bot = new TelegramBot(token, {polling: true});

