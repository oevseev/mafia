// Движок игры
var gameManager = require('./game');

// Массив данных комнат
var rooms = {};
exports.rooms = rooms;

// Комнаты, ожидающие подключения игроков
var pending = [];

// Прототип класса комнаты
function Room(id, options) {
  // Идентификатор комнаты
  this.id = id;
  // Закрыта ли комната для подключения
  this.isSealed = false;

  // Массив подключенных к комнате клиентовx
  this.clients = {};
  this.ids = []; // ID в порядке подключения
  // Хозяин комнаты
  this.owner = null;

  // Объект игры
  this.game = null;
  // Опции
  this.options = options;

  // Таймаут комнаты
  this.timeout = null;

  // Подключение к комнате.
  this.connect = function (playerID, playerName, socket) {
    if (this.isSealed) {
      return;
    }

    // Добавляем игрока в список клиентов
    this.clients[playerID] = {
      id: playerID,
      playerName: playerName,
      socket: socket
    };
    if (this.ids.indexOf(playerID) == -1) {
      this.ids.push(playerID);
    }

    console.log("[RM] [%s] Игрок %s присоединяется к игре.", this.id,
      playerName);

    // Если число игроков превышает допустимое, запечатываем комнату.
    if (this.ids.length >= this.options.maxPlayers) {
      this.seal();
    }

    // Если комната до этого была без хозяина, назначаем его.
    // Хозяин имеет исключительное право запечатывать комнату.
    if (!this.owner) {
      this.owner = this.clients[playerID];
      console.log("[RM] [%s] Игрок %s становится хозяином комнаты.", this.id,
        playerName);
    }
  };

  // Отключение от комнаты
  this.disconnect = function (playerID) {
    var playerName = this.clients[playerID].playerName;

    delete this.clients[playerID];
    console.log("[RM] [%s] Игрок %s выходит из игры.", this.id, playerName);

    if (Object.keys(this.clients).length == 0) {
      this.del();
    }
  }

  // Удаление комнаты
  this.del = function () {
    if (this.game) {
      clearTimeout(this.game.timeout);
      this.game = null;
    }

    delete rooms[this.id];
    if (pending.indexOf(this.id) > -1) {
      pending.splice(pending.indexOf(this.id), 1);
    }

    console.log("[RM] Комната /id/%s/ удалена.", this.id);
  };

  // Получение списка игроков (поименно в порядке подключения)
  this.getPlayerList = function () {
    var clients = this.clients;
    return this.ids.map(function (id) {
      return clients[id].playerName;
    });
  };

  // Запечатывание комнаты.
  // В запечатанную комнату нельзя будет подключиться, а любая попытка
  // подключения будет игнорироваться.
  this.seal = function () {
    if (this.isSealed) {
      return;
    }

    this.isSealed = true;
    // Удаляем комнату из списка доступных для поиска
    pending.splice(pending.indexOf(this.id), 1);

    console.log("[RM] Комната /id/%s/ запечатана.", this.id);
  };

  // Установить таймаут на удаление комнаты
  this.setRoomTimeout = function (timeout) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(this.del.bind(this), timeout * 1000, this.id);
  };

  // Начало игры.
  // Начать игру можно лишь только тогда, когда комната запечатана.
  this.startGame = function (callback) {
    if (!this.isSealed) {
      return;
    }
    gameManager.newGame(this, callback);
  }
}

// Функция поиска комнаты.
// Возвращает ID комнаты из массива pending или создает новую, если массив
// pending является пустым. Если комната не найдена, создает новую с указанными
// параметрами.
exports.findRoomID = function (options, timeout) {
  if (pending.length > 0) {
    return pending[Math.floor(Math.random() * pending.length)];
  } else {
    return exports.newRoomID(options, timeout);
  }
};

// Функция создания комнаты.
// ID комнаты генерируется случайным путем из цифр и букв латинского алфавита.
exports.newRoomID = function (options, timeout) {
  var id = "";
  var chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (var i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  rooms[id] = new Room(id, options);
  pending.push(id); // Добавление комнаты в список ожидающих начала
  rooms[id].setRoomTimeout(timeout);

  console.log("[RM] Создана комната /id/%s/", id);
  return id;
};