var path = require('path');

var express = require('express');
var router = express.Router();

var game = require('./game');

// Кнопки в главном меню игры
router.get('/find', game.findRoom);
router.get('/new', game.newRoom);

// Комната с выбранным ID
router.get(/^\/id\/([a-zA-Z0-9]{8})$/, function (req, res) {
  game.displayRoom(req, res, req.params[0]);
});

// Ошибка 404
router.get('*', function (req, res) {
  res.status(404);
  res.render('404', {message: "Страница не найдена."});
});

module.exports = router;