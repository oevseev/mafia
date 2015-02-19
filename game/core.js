// Прототип класса игры
function Game(room, callback) {
  // Комната, которой принадлежит игра
  this.room = room;

  this.start = function (callback) {
    console.log("[GAME] [" + this.room.id + "] Игра началась.");
  };

  this.getInfo = function () {
    return {};
  };
}

// Создание игры.
exports.newGame = function (room, callback) {
  if (!room.game) {
    room.game = new Game(room);
    room.game.start(callback);
  }
}