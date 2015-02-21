var fs = require('fs');
var path = require('path');

var express = require('express');
var SocketIO = require('socket.io');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var serveStatic = require('serve-static');
var serveFavicon = require('serve-favicon');

// Локальные зависимости
var game = require('./mafia');
var routes = require('./routes');

// Загрузка файла конфигурации.
// Для очищения JSON-файла от комментариев используется JSON.minify.
JSON.minify = require('node-json-minify');
var config = JSON.parse(JSON.minify(fs.readFileSync('./config.json', 'utf8')));

// Создание приложения Express.js
var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

if (config.debug) { app.use(morgan('short')); }
app.use(cookieParser());
app.use(serveFavicon(path.join(__dirname, 'public/favicon.ico')));
app.use(serveStatic('public', {'index': ['index.html', 'index.htm']}));
app.use('/', routes);

// Запуск сервера, слушающего порт, указанный в config.json
var port = process.env.PORT || config.port;
var server = app.listen(port, function onStart() {
  var host = server.address().address;
  var port = server.address().port;

  console.log("Сервер запущен по адресу %s:%s.\n", host, port);
});

// Инициализация Socket.IO.
// При подключении клиента передаем управление модулю игры.
var io = SocketIO.listen(server);
game.useIO(io, config);
io.on('connection', game.clientConnection);