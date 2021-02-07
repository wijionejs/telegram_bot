require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const geolib = require('geolib');
const _ = require('lodash');

const config = require('./config');
const helpers = require('./helpers');
const keyboard = require('./keyboard');
const kb = require('./keyboard_buttons');
const Film = require('./models/Film.model');
const Cinema = require('./models/Cinema.model');
const User = require('./models/User.model');
const callbackActions = require('./callback_actions');

mongoose.connect('mongodb+srv://user:!password!@cluster0.q5xz8.mongodb.net/films_db?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
        console.log('Connected to db')
    })
    .catch(() => console.log('connection failed'));

helpers.logStart();

const token = process.env.BOT_API_TOKEN;

const bot = new TelegramBot(token, {polling: true});

bot.on('message', msg => {
    const chatId = helpers.getChatId(msg);
    switch (msg.text) {
       case kb.home.favorites:
           sendFavorites(chatId, msg.from.id);
           break;
       case kb.home.cinemas:
           bot.sendMessage(chatId, 'Отправить местоположение', {
               reply_markup: {
                   keyboard: keyboard.cinemas
               }
           });
           break;
       case kb.home.films:
           bot.sendMessage(chatId, 'Выберите жанр:', {
               reply_markup: {
                   keyboard: keyboard.films
               }
           });
           break;
       case kb.films.comedy:
           sendFilmsByQuery(chatId, {type: 'comedy'});
           break;
       case kb.films.action:
           sendFilmsByQuery(chatId, {type: 'action'});
           break;
       case kb.films.random:
           sendFilmsByQuery(chatId, {});
           break;
       case kb.back:
           bot.sendMessage(chatId, 'Что вы хотите посмотреть?', {
               reply_markup: {
                   keyboard: keyboard.home,
               },
           });
           break;
    }

    if (msg.location) {
        cinemasByCoords(chatId, msg.location);
    }
});

bot.onText(/\/start/, msg => {
    const text = 'Пожалуйста, нажмите одну из кнопок';

    bot.sendMessage(helpers.getChatId(msg), text, {
        reply_markup: {
            keyboard: keyboard.home,
        }
    })
});

bot.onText(/^\/f(.+)$/, async (msg, [source, uuid]) => {
    const film = await Film.findOne({uuid});
    const user = await User.findOne({telegramId: msg.from.id});

    let isFav = false;

    if (user) {
        isFav = user.films.includes(uuid);
    }

    const favText = isFav ? 'Удалить из избранного' : 'Добавить в избранное';


    const caption = `Название: ${film.name}\nГод: ${film.year}\nРейтинг: ${film.rate}\nДлительность: ${film.length}\nСтрана: ${film.country}`;
    
    bot.sendPhoto(helpers.getChatId(msg), film.picture, {
        caption,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: favText,
                        callback_data: JSON.stringify({
                            type: callbackActions.TOGGLE_FAV_FILM,
                            filmUuid: film.uuid,
                            isFav,
                        }),
                    },
                    {
                        text: 'Показать кинотеатры',
                        callback_data: JSON.stringify({
                            type: callbackActions.SHOW_CINEMAS,
                            cinemas: film.cinemas,
                        }),
                    },
                ],
                [
                    {
                        text: 'Открыть на кинопоиске',
                        url: film.link,
                    },
                ]
            ]
        }
    })
});

bot.onText(/\/c(.+)/, async (msg, [source, uuid]) => {
    const cinema = await Cinema.findOne({uuid: uuid});

    bot.sendMessage(helpers.getChatId(msg), `Кинотеатр ${cinema.name}`, {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Посетить сайт',
                        url: cinema.url
                    },
                    {
                        text: 'Показать на карте',
                        callback_data: JSON.stringify({
                            type: callbackActions.SHOW_ON_MAP,
                            lat: cinema.location.latitude,
                            long: cinema.location.longitude,
                        }),
                    }
                ],
                [
                    {
                        text: 'Показать фильмы',
                        callback_data: JSON.stringify({
                            type: callbackActions.SHOW_FILMS,
                            films: cinema.films,
                        }),
                    }
                ]
            ]
        }
    })
});

bot.on('callback_query', query => {
    const data = JSON.parse(query.data);
    const chatId = query.message.chat.id;

    switch (data.type) {
        case callbackActions.TOGGLE_FAV_FILM:
            toggleFavorite(query.id, data.filmUuid, query.from.id, data.isFav);
            break;
        case callbackActions.SHOW_FILMS:
            sendFilmsByQuery(chatId, { uuid: { '$in': data.films }});
            break;
        case callbackActions.SHOW_CINEMAS:
            sendCinemasByFilm(chatId, data.cinemas);
            break;
        case callbackActions.SHOW_ON_MAP:
            bot.sendLocation(chatId, data.lat, data.long);
            break;
    }
});

bot.on('inline_query', async query => {
    const films = await Film.find({});

    let results = films.map(film => {
        const caption = `Название: ${film.name}\nГод: ${film.year}\nРейтинг: ${film.rate}\nДлительность: ${film.length}\nСтрана: ${film.country}`;
        return {
            id: film.uuid,
            type: 'photo',
            photo_url: film.picture,
            thumb_url: film.picture,
            caption,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'Кинопоиск: ' + film.name,
                            url: film.link,
                        }
                    ]
                ]
            }
        };
    });

    bot.answerInlineQuery(query.id, results, {
        cache_time: 0,
    });
});

async function sendFilmsByQuery(chatId, query) {
    const films = await Film.find(query);
    const html = filmsToHtml(films);



    sendHtml(chatId, html, 'films');
}

async function toggleFavorite(queryId, filmUuid, telegramId, isFav) {
    const user = await User.findOne({ telegramId });
    let userPromise;

    if (user) {
        if (isFav) {
            user.films = user.films.filter(f => f !== filmUuid);
        } else {
            user.films.push(filmUuid);
        }
        userPromise = user;
    } else {
        userPromise = new User({
            telegramId,
            films: [filmUuid],
        });
    };
    await userPromise.save();

    const text = isFav ? 'Удалено из избранного' : 'Добавлено в избранное';
    bot.answerCallbackQuery(queryId, text);
}

function filmsToHtml(films) {
    return films.map((f, i) => {
        return `<b>${i + 1}.</b> ${f.name} - /f${f.uuid}`;
    }).join('\n');
}

function cinemasToHtml(cinemas) {
    return cinemas.map((c, i) => {
        let html = `<b>${i + 1}.</b> ${c.name} - /c${c.uuid}.`;
        if (c.distance) {
            html += `<i>Расстояние:</i> ${c.distance} км.`;
        }
        return html;

    }).join('\n');
}

function sendHtml(chatId, html, kbName) {
    const options = {
        parse_mode: 'HTML'
    };

    if (kbName) {
        options.reply_markup = {
            keyboard: keyboard[kbName]
        }
    }

    bot.sendMessage(chatId, html, options);
}

async function cinemasByCoords(chatId, location) {
    let cinemas = await Cinema.find({});
    cinemas.forEach(c => {
        c.distance = geolib.getDistance(location, c.location) / 1000;
    });

    cinemas = _.sortBy(cinemas, 'distance');
    const html = cinemasToHtml(cinemas);

    sendHtml(chatId, html, 'home');
}

async function sendFavorites(chatId, telegramId) {
    const user = await User.findOne({ telegramId });
    if (!user) {
        sendHtml(chatId, 'Вы еще ничего не добавили в избранное.', 'home');
        return;
    }

    const films = await Film.find({ uuid: { '$in': user.films } });
    const html = films.length ? filmsToHtml(films) : 'Вы еще ничего не добавили в избранное.';

    sendHtml(chatId, html, 'home');
}

async function sendCinemasByFilm(chatId, cinemasIds) {
    const cinemas = await Cinema.find({ uuid: { '$in': cinemasIds }});
    const html = cinemasToHtml(cinemas);
    sendHtml(chatId, html, 'home');
}