var uuid = require('node-uuid');

// Движок и менеджер комнат
var core = require('./core');
var roomManager = require('./rooms');

// Главный объект Socket.IO
var io;

// Файл конфигурации (config.json)
var config;

exports.useIO = function (_io, _config) {
  io = _io;
  config = _config;
  roomManager.config = config;
};

// Главная функция обработки событий сокета.
// Это — единственная функция модуля игры, доступная извне (не считая функций
// рендера ниже); вся логика игры так или иначе связана с этой функцией.
exports.clientConnection = function (socket) {
  if (config.debug) {
    var clientIP = socket.request.connection.remoteAddress;
    console.log("[IO] Соединение с клиентом " + clientIP);
  }

  // Получение UUID (только через API)
  socket.on('getNewPlayerID', function onGetNewPlayerID() {
    socket.emit('playerIDReturned', uuid.v4());
  });

  // Кнопки главного меню
  socket.on('findRoom', function onFindRoom() {
     socket.emit('roomIDReturned', roomManager.findRoomID());
  });
  socket.on('newRoom', function onNewRoom() {
     socket.emit('roomIDReturned', roomManager.newRoomID());
  });

  // Подтверждение комнаты
  socket.on('ackRoom', function onAckRoom(data) {
    var roomID = data.roomID;
    var playerID = data.playerID;
    var playerName = 'playerName' in data ? data.playerName :
      config.defaultName;

    // Если игрока нет в комнате
    if (!(playerID in roomManager.rooms[roomID].clients) && roomManager.
      rooms[roomID].sealed)  // и комната запечатана
    {
      // Отправляем сообщение о том, что игра уже началась
      socket.emit('roomIsSealed');
      // Прерываем обработку события
      return;
    }
    
    // Если игрока нет в комнате, но комната еще не запечатана
    if (!(playerID in roomManager.rooms[roomID].clients))  
    {
      // Добавляем игрока в комнату
      roomManager.rooms[roomID].connect(playerID, playerName);
      // Оповещаем всех игроков о присоединении нового игрока
      socket.broadcast.to(roomID).emit('newPlayerConnection', playerName);
    }

    // Подключаем клиента к соответствующей комнате Socket.IO
    socket.join(roomID);
    // Отправляем игроку информацию о комнате
    socket.emit('initRoomInfo', roomManager.rooms[roomID].getInfo());
  });

  // Начало игры
  socket.on('startGame', function onStartGame(data) {
    // Если игрок — владелец комнаты
    if (data.playerID === roomManager.rooms[data.roomID].owner) {
      // Запечатываем ее
      roomManager.rooms[data.roomID].seal();
    }
  });

  socket.on('leaveGame', function onLeaveGame(data) {
    // Здесь должен обрабатываться сигнал о выходе из игры.
  });

  socket.on('playerVote', function onPlayerVote(data) {
    // Здесь должно обрабатываться голосование игрока.
  });

  socket.on('chatMessage', function onChatMessage(data) {
    // Здесь должно обрабатываться сообщение в чат и его ретрансляция другим
    // игрокам.
  });
};

// Далее следуют функции, возвращающие клиенту отрендеренные шаблоны.
// По правде говоря, их можно было поместить в routes.js, но оставить их здесь
// показалось наиболее верным (и эстетически приятным) решением.

// Страница загрузки при поиске
exports.findRoom = function (req, res) {
  res.render('loading', {eventName: 'findRoom',
    message: "Идет поиск игры."});
};

// Страница загрузки при создании
exports.newRoom = function (req, res) {
  res.render('loading', {eventName: 'newRoom',
    message: "Идет создание комнаты."});
};

// Рендер шаблона комнаты
exports.displayRoom = function (req, res, roomID) {
  if (roomID in roomManager.rooms) {
    // Назначение пользователю уникального идентификатора
    if (!('playerID' in req.cookies)) {
      res.cookie('playerID', uuid.v4());
    }
    res.render('room', {roomID: roomID});
  } else {
    res.status(404);
    res.render('404', {message: "Комнаты не существует."})
  }
}