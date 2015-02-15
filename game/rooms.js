var ID_LENGTH = 8;

// Массив данных комнат
var rooms = {};
exports.rooms = rooms;

// Комнаты, ожидающие подключения игроков
var pending = [];

// Файл конфигурации
var config; 
exports.config = config;

// Прототип класса комнаты
function Room(id)
{
  // Идентификатор комнаты
  this.id = id;
  // Массив подключенных к комнате клиентов
  this.clients = {};
  // Хозяин комнаты
  this.owner = null;
  // Закрыта ли комната для подключения
  this.sealed = false;

  // Подключение к комнате.
  this.connect = function (playerID, playerName) {
    if (!this.sealed) {
      // Добавляем игрока в список клиентов
      this.clients[playerID] = {id: playerID, name: playerName};

      // Если комната до этого была без хозяина, назначаем его.
      // Хозяин имеет исключительное право запечатывать комнату.
      if (!this.owner) {
        this.owner = this.clients[playerID];
      }

      console.log("[RM] [" + this.id + "] Игрок " + playerName + 
        " присоединяется к игре.");
    }
  };

  // Запечатывание комнаты.
  // В запечатанную комнату нельзя будет подключиться, а любая попытка
  // подключения будет игнорироваться.
  this.seal = function () {
    if (!this.sealed)
    {
      this.sealed = true;
      // Удаляем комнату из списка доступных для поиска
      pending.splice(pending.indexOf(this), 1);

      console.log("[RM] Комната /id/" + this.id + "/ запечатана.");
    }
  };

  // Получение публичной информации о комнате
  this.getInfo = function (playerID) {
    return "OK";
  };
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
exports.newRoomID = function () {
  var id = "";
  var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (var i = 0; i < ID_LENGTH; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  rooms[id] = new Room(id);
  pending.push(id);  // Добавление комнаты в список ожидающих начала

  console.log("[RM] Создана комната /id/" + id + "/");
  return id;
};