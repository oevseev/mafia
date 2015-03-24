var path = require('path');

var express = require('express');
var uuid = require('node-uuid');

// Локальные зависимости
var mafia = require('./mafia');

// Создаем объект роутера, который будет экспортироваться
var router = express.Router();

// Комната с выбранным ID
router.get(/^\/id\/([a-zA-Z0-9]{8})$/, function(req, res) {
  var roomID = req.params[0];
  mafia.checkRoomExistence(roomID, function (roomExists) {
    if (roomExists) {
      // Назначение пользователю уникального идентификатора
      if (!('playerID' in req.cookies)) {
        res.cookie('playerID', uuid.v4());
      }
      res.render('room', {
        roomID: roomID
      });
    } else {
      res.status(404);
      res.render('404', {
        message: "Комнаты не существует."
      });
    }
  });
});

// Простой ответ GET-запрос, предназначенный для пинга
router.get('/status', function(req, res) {
  res.send("OK");
});

// Ошибка 404
router.get('*', function(req, res) {
  res.status(404);
  res.render('404', {
    message: "Страница не найдена."
  });
});

module.exports = router;