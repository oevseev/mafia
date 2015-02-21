var uuid = require('node-uuid');

// Менеджер комнат
var roomManager = require('./rooms');

// Главный объект Socket.IO
var io;

// Файл конфигурации (config.json)
var config;

exports.useIO = function (_io, _config) {
  io = _io;
  config = _config;
};

// Главная функция обработки событий сокета.
// Это — единственная функция модуля игры, доступная извне (не считая функций
// рендера ниже); вся логика игры так или иначе связана с этой функцией.
exports.clientConnection = function (socket) {
  if (config.debug) {
    var clientIP;
    var forwarded = socket.request.headers['x-forwarded-for'];

    if (forwarded) {
      // Соединение через Heroku (или другую систему рутинга)
      var forwardedIPs = forwarded.split(',');
      clientIP = forwardedIPs[0];
    }
    if (!clientIP) {
      // Обычное соединение
      clientIP = socket.request.connection.remoteAddress;
    }

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
    var newRoomID = roomManager.newRoomID(config.defaultOptions);
    socket.emit('roomIDReturned', newRoomID);
    // Устанавливаем лимит времени на существование комнаты
    roomManager.rooms[newRoomID].setRoomTimeout(config.newRoomTimeout);
  });

  // Подтверждение комнаты
  socket.on('ackRoom', function onAckRoom(userData) {
    var roomID = userData.roomID;
    var playerID = userData.playerID;
    var playerName = 'playerName' in userData ? userData.playerName :
      config.defaultName;

    // Проверка на существование комнаты
    if (typeof roomManager.rooms[roomID] === 'undefined') { return; }

    // Подключается ли игрок в первый раз
    var isFirstConnection = false;

    // Если игрока нет в комнате
    if (!(playerID in roomManager.rooms[roomID].clients) && roomManager.
      rooms[roomID].isSealed)  // и комната запечатана
    {
      // Отправляем сообщение о том, что игра уже началась
      socket.emit('roomIsSealed');
      // Прерываем обработку события
      return;
    }
    
    // Если игрока нет в комнате, но комната еще не запечатана
    if (!(playerID in roomManager.rooms[roomID].clients))  
    {
      var isFirstConnection = true;
      // Добавляем игрока в комнату
      roomManager.rooms[roomID].connect(playerID, playerName, socket);
      // Оповещаем всех игроков о присоединении нового игрока
      socket.broadcast.to(roomID).emit('newPlayer', playerName);
    } else {
      // Изменяем сокет
      roomManager.rooms[roomID].clients[playerID].socket = socket;
    }

    // Подключаем клиента к соответствующей комнате Socket.IO
    socket.join(roomID);
    // Отправляем игроку информацию о комнате
    var roomInfo = {
      isFirstConnection: isFirstConnection,
      canStartGame: !roomManager.rooms[roomID].isSealed && (playerID ===
        roomManager.rooms[roomID].owner.id),
      playerList: roomManager.rooms[roomID].getPlayerList(),
    };
    socket.emit('roomInfo', roomInfo);
  });

  // Начало игры
  socket.on('startGame', function onStartGame(userData) {
    var roomID = userData.roomID;
    var playerID = userData.playerID;

    if (typeof roomManager.rooms[roomID] === 'undefined') { return; }

    // Если игрок — владелец комнаты
    if (playerID === roomManager.rooms[roomID].owner.id) {
      // Запечатываем ее и начинаем игру
      roomManager.rooms[roomID].seal();
      roomManager.rooms[roomID].startGame(function onPhaseChange(phase) {
        io.to(roomID).emit('phaseChange', phase);
      });
      // Оповещаем всех игроков о начале игры
      io.to(roomID).emit('gameStarted');
      // Устанавливаем таймаут для неактивной комнаты
      roomManager.rooms[roomID].setRoomTimeout(
        config.inactiveRoomTimeout);
    }
  });

  // Выход из игры
  socket.on('leaveGame', function onLeaveGame(userData) {
    var roomID = userData.roomID;
    var playerID = userData.playerID;

    if (typeof roomManager.rooms[roomID] === 'undefined') { return; }

    // Здесь должен обрабатываться сигнал о выходе из игры.
  });

  socket.on('requestRole', function onRequestRole(userData) {
    var roomID = userData.roomID;
    var playerID = userData.playerID;

    if (typeof roomManager.rooms[roomID] === 'undefined') { return; }

    // Здесь должен обрабатываться запрос роли пользователя
  })

  // Голосование
  socket.on('playerVote', function onPlayerVote(data) {
    var roomID = data.userData.roomID;
    var playerID = data.userData.playerID;

    if (typeof roomManager.rooms[roomID] === 'undefined') { return; }

    // Здесь должно обрабатываться голосование игрока.

    roomManager.rooms[roomID].setRoomTimeout(config.inactiveRoomTimeout);
  });

  // Сообщение чата.
  // Чат перекрывается ночью для мирных жителей.
  socket.on('chatMessage', function onChatMessage(data) {
    var roomID = data.userData.roomID;
    var playerID = data.userData.playerID;
    var playerName = 'playerName' in data.userData ? data.userData.playerName :
      config.defaultName;

    if (typeof roomManager.rooms[roomID] === 'undefined') { return; }

    if (playerID in roomManager.rooms[roomID].clients)
    {
      socket.broadcast.to(roomID).emit('chatMessage', {
        playerName: playerName, message: data.message
      });
      // В зависимости от того, начата игра или нет, выбираем таймаут
      var timeout = roomManager.rooms[roomID].game ?
        config.inactiveRoomTimeout : config.newRoomTimeout;
      roomManager.rooms[roomID].setRoomTimeout(timeout);
    }
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
    res.render('404', {message: "Комнаты не существует."});
  }
}