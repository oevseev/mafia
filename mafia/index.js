var uuid = require('node-uuid');

// Менеджер комнат
var roomManager = require('./rooms');

/**
 * Глобальные объекты
 */

// Главный объект Socket.IO
var io;
// Файл конфигурации (config.json)
var config;

/**
 * Выполняет callback только в том случае, если игрок уже подтвердил вход в
 * комнату. В противном случае callback игнорируется.
 */
function assertAck(socket, callback) {
  return function (data) {
    if (typeof socket.userData == 'undefined') {
      return;
    }
    callback(socket.userData.room, socket.userData.player, data);
  };
}

/**
 * Главная функция обработки событий сокета.
 * Все сообщения, посылаемые серверу, обрабатываются здесь.
 */
function onClientConnection(socket) {
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

    console.log("[IO] Соединение с клиентом %s", clientIP);
  }

  /**
   * Получение UUID (только через API)
   */
  socket.on('getNewPlayerID', function onGetNewPlayerID() {
    socket.emit('playerIDReturned', uuid.v4());
  });

  /**
   * Кнопки главного меню
   */
  socket.on('findRoom', function onFindRoom() {
    var roomID = roomManager.findRoomID(
      config.defaultOptions, config.newRoomTimeout);
    socket.emit('roomIDReturned', roomID);
  });
  socket.on('newRoom', function onNewRoom() {
    var roomID = roomManager.newRoomID(
      config.defaultOptions, config.newRoomTimeout);
    socket.emit('roomIDReturned', roomID);
  });

  /**
   * Подтверждение комнаты
   */
  socket.on('ackRoom', function onAckRoom(data) {
    if (typeof data == 'undefined') {
      return;
    }

    var room = roomManager.rooms[data.roomID];
    var playerID = data.playerID;
    var playerName = data.playerName || config.defaultName;

    // Проверка на существование комнаты
    if (typeof room == 'undefined') {
      socket.emit('roomDoesNotExist');
      return;
    }

    room.connect(playerID, playerName, socket, {
      // Вызывается при первом подключении к комнате
      first: function (playerData) {
        socket.broadcast.to(room.id).emit('playerJoined', playerData);
      },

      // Вызывается при успешном подключении к комнате
      success: function (userData, roomData) {
        socket.userData = userData;
        socket.join(room.id);
        socket.emit('roomData', roomData);
      },

      // Вызывается, если комната запечатана
      sealed: function () {
        socket.emit('roomIsSealed');
      }
    });
  });

  /**
   * Начало игры
   */
  socket.on('startGame', assertAck(socket,
    function onStartGame(room, player) {
      if (player === room.owner) {
        room.startGame(function onUpdate(eventName, data) {
          io.to(room.id).emit(eventName, data);
        }, config.inactiveRoomTimeout);
      }
    }
  ));

  /**
   * Выход из игры
   */
  socket.on('leaveGame', assertAck(socket,
    function onLeaveGame(room, player) {
      room.disconnect(player, function (playerInfo) {
        socket.broadcast.to(room.id).emit('playerLeft', playerInfo);
        socket.leave(room.id);
        if (playerInfo.role == 'mafia') {
          socket.leave(room.id + '_m');
        }
      })
    }
  ));

  /**
   * Голосование
   */
  socket.on('playerVote', assertAck(socket,
    function onPlayerVote(room, player, data) {}
  ));

  /**
   * Выбор игрока
   */
  socket.on('playerChice', assertAck(socket,
    function onPlayerChoice(room, player, data) {}
  ));

  /**
   * Сообщение чата
   */
  socket.on('chatMessage', assertAck(socket,
    function onChatMessage(room, player, data) {}
  ));
};

/**
 * Проверка существования комнаты
 */
exports.checkRoomExistence = function (roomID, callback) {
  callback(roomID in roomManager.rooms);
};

/**
 * Инициализация модуля игры
 */
exports.initialize = function (_io, _config) {
  io = _io;
  config = _config;

  io.on('connection', onClientConnection);
};