var ID_LENGTH = 8;

// Движок игры
var gameManager = require('./mafia');

// Массив данных комнат
var rooms = {};
exports.rooms = rooms;

// Комнаты, ожидающие подключения игроков
var pending = [];

// Удаление комнаты
function delRoom(room_id) {
  delete rooms[room_id];
  console.log("[RM] Комната /id/" + room_id + "/ удалена.");
}

// Прототип класса комнаты
function Room(id, options)
{
  // Идентификатор комнаты
  this.id = id;
  // Массив подключенных к комнате клиентов
  this.clients = {};
  this.ids = [];  // ID в порядке подключения
  // Хозяин комнаты
  this.owner = null;
  // Закрыта ли комната для подключения
  this.isSealed = false;

  // Объект игры
  this.game = null;
  // Опции
  this.options = options;

  // Таймаут комнаты
  this.timeout = null;

  // Подключение к комнате.
  this.connect = function (playerID, playerName, socket) {
    if (this.isSealed) { return; }

    // Добавляем игрока в список клиентов
    this.clients[playerID] = {id: playerID, playerName: playerName,
      socket: socket};
    if (!(playerID in this.ids)) { this.ids.push(playerID); }

    console.log("[RM] [" + this.id + "] Игрок " + playerName + 
      " присоединяется к игре.");

    // Если число игроков превышает допустимое, запечатываем комнату.
    if (this.ids.length >= this.options.maxPlayers) {
      this.seal();
    }

    // Если комната до этого была без хозяина, назначаем его.
    // Хозяин имеет исключительное право запечатывать комнату.
    if (!this.owner) {
      this.owner = this.clients[playerID];
      console.log("[RM] [" + this.id + "] Игрок " + playerName +
        " становится хозяином комнаты.");
    }
  };

  // Установить таймаут на удаление комнаты
  this.setRoomTimeout = function (timeout) {
    if (this.timeout) { clearTimeout(this.timeout); }
    this.timeout = setTimeout(delRoom, timeout * 1000, this.id);
  }

  // Запечатывание комнаты.
  // В запечатанную комнату нельзя будет подключиться, а любая попытка
  // подключения будет игнорироваться.
  this.seal = function () {
    if (this.isSealed) { return; }

    this.isSealed = true;
    // Удаляем комнату из списка доступных для поиска
    pending.splice(pending.indexOf(this), 1);

    console.log("[RM] Комната /id/" + this.id + "/ запечатана.");
  };

  // Начало игры.
  // Начать игру можно лишь только тогда, когда комната запечатана.
  this.startGame = function (callback) {
    if (!this.isSealed) { return; }
    gameManager.newGame(this, callback);
  }

  // Получение списка игроков (поименно в порядке подключения)
  this.getPlayerList = function () {
    var clients = this.clients;
    return this.ids.map(function (id) { return clients[id].playerName; });
  };

  // Получение информации об игре
  this.getGameInfo = function () {
    if (this.game) { return this.game.getInfo(); }
    return;
  }
}

// Функция поиска комнаты.
// Возвращает ID комнаты из массива pending или создает новую, если массив
// pending является пустым.
exports.findRoomID = function () {
  if (pending.length > 0) {
    return pending[Math.floor(Math.random() * pending.length)];
  } else {
    return exports.newRoomID();
  }
};

// Функция создания комнаты.
// ID комнаты генерируется случайным путем из цифр и букв латинского алфавита.
exports.newRoomID = function (options) {
  var id = "";
  var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (var i = 0; i < ID_LENGTH; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  rooms[id] = new Room(id, options);
  pending.push(id);  // Добавление комнаты в список ожидающих начала

  console.log("[RM] Создана комната /id/" + id + "/");
  return id;
};