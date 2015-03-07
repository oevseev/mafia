// Менеджер комнат
var roomManager = require('./rooms');

// Главный объект Socket.IO
var io;
// Файл конфигурации (config.json)
var config;

// Выполняет callback только в том случае, если игрок уже подтвердил вход в
// комнату. В противном случае callback игнорируется.
function assertAck(socket, callback) {
  return function (data) {
    if (typeof socket.userData == 'undefined') {
      return;
    }
    callback(socket.userData.room, socket.userData.player, data);
  };
}

// Главная функция обработки событий сокета.
// Вся логика игры так или иначе связана с этой функцией.
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

  // Получение UUID (только через API)
  socket.on('getNewPlayerID', function onGetNewPlayerID() {
    socket.emit('playerIDReturned', uuid.v4());
  });

  // Кнопки главного меню
  socket.on('findRoom', function onFindRoom() {
    var roomID = roomManager.findRoomID(config.defaultOptions,
      config.newRoomTimeout);
    socket.emit('roomIDReturned', roomID);
  });
  socket.on('newRoom', function onNewRoom() {
    var roomID = roomManager.newRoomID(config.defaultOptions,
      config.newRoomTimeout);
    socket.emit('roomIDReturned', roomID);
  });

  // Подтверждение комнаты
  socket.on('ackRoom', function onAckRoom(data) {
    if (typeof data == 'undefined') {
      return;
    }

    var room = roomManager.rooms[data.roomID];
    var playerID = data.playerID;
    var playerName = data.playerName || config.defaultName;

    // Проверка на существование комнаты
    if (typeof room == 'undefined') {
      return;
    }

    // Подключается ли игрок в первый раз
    var isFirstConnection = false;

    // Если игрока нет в комнате и комната запечатана
    if (!(playerID in room.clients) && room.isSealed) {
      // Отправляем сообщение о том, что игра уже началась
      socket.emit('roomIsSealed');
      // Прерываем обработку события
      return;
    }

    // Если игрока нет в комнате, но комната еще не запечатана
    if (!(playerID in room.clients)) {
      isFirstConnection = true;
      // Добавляем игрока в комнату
      room.connect(playerID, playerName, socket);
      // Оповещаем всех игроков о присоединении нового игрока
      socket.broadcast.to(room.id).emit('playerJoined', {
        playerName: playerName
      });
    } else {
      // Изменяем сокет
      room.clients[playerID].socket = socket;
    }

    // Устанавливаем данные сессии
    socket.userData = {
      room: room,
      player: room.clients[playerID]
    };

    // Подключаем клиента к соответствующей комнате Socket.IO
    socket.join(room.id);

    // Отправляем игроку информацию о комнате
    var roomData = {
      // Индекс игрока
      playerIndex: room.ids.indexOf(playerID),
      // Подключается ли игрок впервые
      isFirstConnection: isFirstConnection,
      // Может ли игрок начинать игру
      canStartGame: !room.game && (playerID === room.owner.id),
      // Список игроков в комнате
      playerList: room.getPlayerList()
    };

    // Если игра началась, добавляем информацию об игре
    if (room.game) {
      // Текущее состояние игры
      roomData.state = room.game.state;
      // Роль игрока
      roomData.role = room.game.roles[playerID];
      // Игроки, чья роль известна
      roomData.exposedPlayers = room.game.getExposedPlayers(playerID);
    }

    socket.emit('roomData', roomData);
  });

  // Начало игры
  socket.on('startGame', assertAck(socket,
    function onStartGame(room, player) {
      // Если игрок — владелец комнаты
      if (player === room.owner && !room.game) {
        // Запечатываем ее и начинаем игру
        room.seal();
        room.startGame(function onUpdate(eventName, data) {
          io.to(room.id).emit(eventName, data);
        });
        // Устанавливаем таймаут для неактивной комнаты
        room.setRoomTimeout(config.inactiveRoomTimeout);
      }
    }
  ));

  // Выход из игры
  socket.on('leaveGame', assertAck(socket,
    function onLeaveGame(room, player) {
      // Здесь должен обрабатываться сигнал о выходе из игры.
    }
  ));

  // Голосование
  socket.on('playerVote', assertAck(socket,
    function onPlayerVote(room, player, data) {
      if (player.id in room.clients && room.game &&
        room.game.state.isVoting && !(room.game.elimPlayers.indexOf(
          player.id) > -1)) {
        var voteData = {
          playerIndex: room.ids.indexOf(player.id),
          vote: data.vote
        };

        // Не даем проголосовать против себя или против уже исключенного
        if (voteData.playerIndex === voteData.vote || room.game.elimPlayers
          .indexOf(voteData.vote) > -1) {
          socket.emit('voteRejected');
          return;
        }

        if (room.game.state.isDay) {
          socket.broadcast.to(room.id).emit('playerVote', voteData);
        } else {
          if (room.game.roles[player.id] == 'mafia') {
            socket.broadcast.to(room.id + '_m').emit('playerVote',
              voteData);
            socket.emit('voteConfirmed');
          } else {
            socket.emit('voteRejected');
            return;
          }
        }

        // Отправляем голосование на проверку
        room.game.processVote(player.id, data.vote);
        // Не даем комнате самоликвидироваться
        room.setRoomTimeout(config.inactiveRoomTimeout);
      }
    }
  ));

  // Сообщение чата.
  // Чат перекрывается ночью для мирных жителей.
  socket.on('chatMessage', assertAck(socket,
    function onChatMessage(room, player, data) {
      if (player.id in room.clients) {
        var msgData = {
          playerIndex: room.ids.indexOf(player.id),
          message: data.message
        };

        if (room.game && !room.game.state.isDay) {
          // Локальный чат мафии (ночью)
          if (room.game.roles[player.id] == 'mafia') {
            socket.broadcast.to(room.id + '_m').emit('chatMessage',
              msgData);
            console.log("[CHAT] [%s] [M] %s: %s", room.id, player.playerName,
              data.message);
          } else {
            if ('id' in data) {
              socket.emit('chatMessageRejected', data.id);
            }
            return;
          }
        } else {
          // Всеобщий чат (днем)
          socket.broadcast.to(room.id).emit('chatMessage', msgData);
          console.log("[CHAT] [%s] %s: %s", room.id, player.playerName,
            data.message);
        }

        // Отправляем подтверждение
        if ('id' in data) {
          socket.emit('chatMessageConfirmed', data.id);
        }

        // В зависимости от того, начата игра или нет, выбираем таймаут
        var timeout = room.game ? config.inactiveRoomTimeout :
          config.newRoomTimeout;
        room.setRoomTimeout(timeout);
      }
    }
  ));
};

// Проверка существования комнаты
exports.checkRoomExistence = function (roomID, callback) {
  callback(roomID in roomManager.rooms);
};

// Инициализация модуля игры
exports.initialize = function (_io, _config) {
  io = _io;
  config = _config;
  io.on('connection', onClientConnection);
};