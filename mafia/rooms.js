var gameManager = require('./game');

/**
 * Список комнат
 */

var rooms = {};
exports.rooms = rooms;

var pendingIDs = []; // ID комнат, ожидающих подключения

/**
 * Прототип класса комнаты.
 *
 * Комната отвечает только за подключение и отключение клиентов. Игровые
 * функции делегируются объекту игры. С каждым объектом комнаты может быть
 * связан единственный объект игры.
 */
function Room(id, options) {
  // Идентификатор комнаты
  this.id = id;
  // Закрыта ли комната для подключения
  this.isSealed = false;

  /**
   * Информация о клиентах
   */

  // Массив подключенных к комнате клиентов
  this.clients = {};
  this.IDs = []; // ID в порядке подключения

  // Хозяин комнаты
  this.owner = null;

  /**
   * Связанные объекты
   */

  // Объект игры
  this.game = null;
  // Опции
  this.options = options;

  // Таймаут комнаты
  this.timeout = null;

  /**
   * Подключение к комнате
   */
  this.connect = function (playerID, playerName, socket, callbacks) {
    // Если игрока нет в комнате, и комната запечатана, то сообщаем об этом
    // игроку и запрещаем подключение.
    if (!this.isPlayerInRoom(playerID) && this.isSealed) {
      callbacks.sealed();
      return;
    }

    // Подключается ли игрок в первый раз
    var isFirstConnection = false;

    // Если игрока нет в комнате, но комната еще не запечатана
    if (!this.isPlayerInRoom(playerID)) {
      isFirstConnection = true;

      // Добавляем игрока в список клиентов
      if (this.IDs.indexOf(playerID) == -1) {
        this.clients[playerID] = {
          id: playerID,
          playerName: playerName,
          socket: socket,
          disconnected: false
        };
        this.IDs.push(playerID);
      } else {
        // Если игрок переподключается к комнате, то не меняем его ID и имя.
        this.clients[playerID].socket = socket;
        this.clients[playerID].disconnected = false;
      }

      console.log("[RM] [%s] Игрок %s подключается к комнате.", this.id,
        playerName);

      // Если число игроков превышает допустимое, запечатываем комнату.
      if (this.IDs.length >= this.options.maxPlayers) {
        this.seal();
      }

      // Если комната до этого была без хозяина, назначаем его.
      // Хозяин имеет исключительное право запечатывать комнату.
      if (!this.owner) {
        this.owner = this.clients[playerID];

        console.log("[RM] [%s] Игрок %s становится хозяином комнаты.", this.id,
          playerName);
      }

      // Оповещаем об успешном первом подключении
      callbacks.first({
        playerIndex: this.IDs.indexOf(playerID),
        playerName: this.clients[playerID].playerName
      });
    } else {
      // Изменяем сокет
      this.clients[playerID].socket = socket;
    }

    // Отправляем игроку информацию о комнате
    var roomData = {
      // Индекс игрока
      playerIndex: this.IDs.indexOf(playerID),
      // Подключается ли игрок впервые
      isFirstConnection: isFirstConnection,
      // Может ли игрок начинать игру
      canStartGame: !this.game && (playerID === this.owner.id),
      // Настройки комнаты
      options: this.options,
      // Список игроков в комнате
      playerList: this.getPlayerList(),
      // Вышедшие игроки
      disconnectedPlayers: this.getDisconnectedPlayers()
    };

    // Если игра началась, добавляем информацию об игре
    if (this.game) {
      // Текущее состояние игры
      roomData.state = this.game.state;
      // Роль игрока
      roomData.role = this.game.roles[roomData.playerIndex];
      // Выбыл ли игрок
      roomData.eliminated = this.game.isEliminated(roomData.playerIndex);
      // Игроки, чья роль известна
      roomData.exposedPlayers = this.game.getExposedPlayers(this.clients[playerID]);
      // Количество секунд до следующего таймаута
      roomData.secondsTillTimeout = this.game.getSecondsTillTimeout();
    }

    // Оповещаем об успешном соединении
    callbacks.success({
      room: this,
      player: this.clients[playerID]
    }, roomData);
  };

  /**
   * Отключение от комнаты
   */
  this.disconnect = function (player, callback) {
    player.disconnected = true;

    if (this.game) {
      this.game.playerLeft(player);
    };

    var playerIndex = this.getPlayerIndex(player);
    callback({
      playerIndex: playerIndex,
      role: this.game ? this.game.roles[playerIndex] : null
    });

    console.log("[RM] [%s] Игрок %s выходит из комнаты.",
      this.id, player.playerName);

    // После отключения игрока от комнаты проверяется, отключены ли также и
    // остальные игроки. Если да, то комната удаляется.
    var needsDeletion = true;
    for (var id in this.clients) {
      if (!this.clients[id].disconnected) {
        needsDeletion = false;
        break;
      }
    }

    if (needsDeletion) {
      this.del();
    }
  };

  /**
   * Удаление комнаты
   */
  this.del = function () {
    if (this.game) {
      clearTimeout(this.game.timeout);
      this.game = null;
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    delete rooms[this.id];
    if (pendingIDs.indexOf(this.id) != -1) {
      pendingIDs.splice(pendingIDs.indexOf(this.id), 1);
    }

    console.log("[RM] Комната /id/%s/ удалена.", this.id);
  };

  /**
   * Находится ли игрок в комнате
   */
  this.isPlayerInRoom = function (playerID) {
    return this.IDs.indexOf(playerID) != -1 &&
      !this.clients[playerID].disconnected;
  };

  /**
   * Получение количества игроков
   */
  this.getPlayerCount = function () {
    return this.IDs.length - this.getDisconnectedPlayers().length;
  };

  /**
   * Получение игрока по его индексу
   */
  this.getPlayerByIndex = function (playerIndex) {
    if (typeof this.IDs[playerIndex] != undefined) {
      return this.clients[this.IDs[playerIndex]];
    }
  }

  /**
   * Получение индекса игрока
   */
  this.getPlayerIndex = function (player) {
    return this.IDs.indexOf(player.id);
  };

  /**
   * Получение списка игроков (поименно в порядке подключения)
   */
  this.getPlayerList = function () {
    var clients = this.clients;
    return this.IDs.map(function (id) {
      return clients[id].playerName;
    });
  };

  /**
   * Получение списка отключившихся игроков
   */
  this.getDisconnectedPlayers = function () {
    var disconnectedPlayers = [];
    for (var id in this.clients) {
      if (this.clients[id].disconnected) {
        disconnectedPlayers.push(this.getPlayerIndex(this.clients[id]));
      }
    }
    return disconnectedPlayers;
  };

  /**
   * Запечатывание комнаты.
   *
   * В запечатанную комнату нельзя будет подключиться, а любая попытка
   * подключения будет игнорироваться.
   */
  this.seal = function () {
    if (this.isSealed) {
      return;
    }

    this.isSealed = true;
    // Удаляем комнату из списка доступных для поиска
    pendingIDs.splice(pendingIDs.indexOf(this.id), 1);

    console.log("[RM] Комната /id/%s/ запечатана.", this.id);
  };

  /**
   * Установка таймаута на удаление комнаты (в секундах)
   */
  this.setRoomTimeout = function (timeout) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(this.del.bind(this), timeout * 1000, this.id);
  };

  /**
   * Обновление таймаута комнаты
   */
  this.updateRoomTimeout = function (newRoomTimeout, inactiveRoomTimeout) {
    var timeout = this.game ? inactiveRoomTimeout : newRoomTimeout;
    this.setRoomTimeout(timeout);
  };

  /**
   * Начало игры.
   */
  this.startGame = function (callbacks) {
    this.seal();
    gameManager.newGame(this, callbacks);
  };

  /**
   * Обработка голосования
   */
  this.handleVote = function (player, data, callbacks) {
    if (data && this.game) {
      this.game.handleVote(player, data, callbacks);
    } else {
      callbacks.rejected({
        // voteID: data.voteID
      });
    }
  };

  /**
   * Обработка выбора
   */
  this.handleChoice = function (player, data, callbacks) {
    if (data && this.game) {
      this.game.handleChoice(player, data, callbacks);
    } else {
      callbacks.rejected({
        // choiceID: data.choiceID
      });
    }
  };

  /**
   * Обработка сообщения чата
   */
  this.handleChatMessage = function (player, data, callbacks) {
    if (data) {
      var roomID = this.game ? this.game.getChatRoomID(player) : this.id;

      if (roomID) {
        callbacks.confirmed({
          roomID: roomID,
          // messageID: data.messageID
          messageData: {
            playerIndex: this.getPlayerIndex(player),
            message: data.message
          }
        });

        console.log("[CHAT] [%s] %s: %s", roomID, player.playerName, data.message);
      } else {
        callbacks.rejected({
          // messageID: data.messageID
        });
      }
    } else {
      callbacks.rejected({
        // messageID: data.messageID
      });
    }
  };  
}

/**
 * Функция поиска комнаты.
 *
 * Возвращает ID комнаты из массива pendingIDs или создает новую, если массив
 * pendingIDs является пустым. Если комната не найдена, создает новую с указанными
 * параметрами.
 */
exports.findRoomID = function (options, timeout) {
  if (pendingIDs.length > 0) {
    return pendingIDs[Math.floor(Math.random() * pendingIDs.length)];
  } else {
    return exports.newRoomID(options, timeout);
  }
};

/**
 * Функция создания комнаты.
 *
 * ID комнаты генерируется случайным путем из цифр и букв латинского алфавита.
 */
exports.newRoomID = function (options, timeout) {
  var id = "";
  var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (var i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  rooms[id] = new Room(id, options);
  pendingIDs.push(id); // Добавление комнаты в список ожидающих начала
  rooms[id].setRoomTimeout(timeout);

  console.log("[RM] Создана комната /id/%s/", id);

  return id;
};
