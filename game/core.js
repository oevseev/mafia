// Прототип класса игры
function Game(room) {
  // Комната, которой принадлежит игра
  this.room = room;

  this.getInfo = function () {
    return {};
  }
}

// Создание игры.
exports.newGame = function (room) {
  if (!room.game) {
    console.log("[GAME] [" + room.id + "] Игра началась.");
    room.game = new Game(room);
  }
}