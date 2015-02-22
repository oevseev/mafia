var path = require('path');

var express = require('express');
var router = express.Router();

var mafia = require('./mafia');

// Кнопки в главном меню игры
router.get('/find', mafia.findRoom);
router.get('/new', mafia.newRoom);

// Комната с выбранным ID
router.get(/^\/id\/([a-zA-Z0-9]{8})$/, function(req, res) {
  mafia.displayRoom(req, res, req.params[0]);
});

// Ошибка 404
router.get('*', function(req, res) {
  res.status(404);
  res.render('404', {
    message: "Страница не найдена."
  });
});

module.exports = router;