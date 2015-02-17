// Прототип класса игры
function Game(room, callback) {
  // Комната, которой принадлежит игра
  this.room = room;
  // Коллбэк, вызываемый при обновлении состояния игры
  this.callback = callback;

  this.getInfo = function () {
    return {};
  }
}

// Создание игры.
exports.newGame = function (room, callback) {
  if (!room.game) {
    console.log("[GAME] [" + room.id + "] Игра началась.");
    room.game = new Game(room, callback);
  }
}