// Прототип класса игры
function Game(room, callback) {
  // Комната, которой принадлежит игра
  this.room = room;

  // Роли игроков
  this.roles = {};

  // Игрок-комиссар
  this.detective = null;

  // Назначение ролей
  this.assignRoles = function () {
    var civilians = [];

    // Изначально все — честные граждане
    for (var id in this.room.clients) {
      this.roles[id] = "civilian";
      civilians.push(id);
    }

    // Назначаем членов мафии согласно mafiaCoeff (каждый N-ный — мафиози)
    var maxMafia = Math.floor(this.room.ids.length / 
      this.room.options.mafiaCoeff)

    for (var i = 0; i < maxMafia; i++)
    {
      var id = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[id] = "mafia";
      // Подключение к особой комнате Socket.IO
      this.room.clients[id].socket.join(this.room.id + '_m');
      civilians.splice(civilians.indexOf(id), 1);
    }

    // Назначение комиссара
    if (civilians) {
      var id = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[id] = "detective";
      this.detective = this.room.clients[id];
    }
  }

  // Начало игры
  this.start = function (callback) {
    console.log("[GAME] [" + this.room.id + "] Игра началась.");
    this.assignRoles();
    for (var id in this.room.clients) {
      this.room.clients[id].socket.emit('roleNotify', this.roles[id]);
    }
  };
}

// Создание игры.
exports.newGame = function (room, callback) {
  if (!room.game) {
    room.game = new Game(room);
    room.game.start(callback);
  }
}