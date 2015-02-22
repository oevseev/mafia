// Прототип класса игры
function Game(room, callback) {
  // Комната, которой принадлежит игра
  this.room = room;
  // Коллбэк игры
  this.callback = callback;

  // Является ли текущая фаза днем
  this.isDay = true;
  // Текущий ход
  this.move = 0;
  // Следующая смена фазы
  this.nextPhaseChange = null;

  // Роли игроков
  this.roles = {};

  // Назначение ролей
  this.assignRoles = function() {
    var civilians = [];

    // Изначально все — честные граждане
    for (var id in this.room.clients) {
      this.roles[id] = "civilian";
      civilians.push(id);
    }

    // Назначаем членов мафии согласно mafiaCoeff (каждый N-ный — мафиози)
    var maxMafia = Math.floor(this.room.ids.length /
      this.room.options.mafiaCoeff);

    for (var i = 0; i < maxMafia; i++) {
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
  };

  // Начало голосования
  this.voteStart = function() {};

  // Конец голосования
  this.voteEnd = function() {};

  // Начало игры
  this.start = function() {
    console.log("[GM] [" + this.room.id + "] Игра началась.");

    // Назначаем роли и сообщаем их игрокам
    this.assignRoles();
    for (var id in this.room.clients) {
      this.room.clients[id].socket.emit('roleNotify', this.roles[id]);
    }

    // Запускаем цепную реакцию!
  };
}

// Создание игры.
exports.newGame = function(room, callback) {
  if (!room.game) {
    room.game = new Game(room, callback);
    room.game.start();
  }
};