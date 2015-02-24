;
(function ($) {
  'use strict';

  // Сокет, с которым связывется клиент
  var socket;
  // Пользовательский интерфейс
  var UI;
  // Данные подтверждения
  var ackData;

  // Настройка сокета.
  // Клиент подключается к сокету, устанавливает ответы на события игры и
  // отправляет подтверждающее сообщение серверу.
  function initSocket() {
    socket = io.connect();

    // События, касающиеся информации о комнате
    socket.on('roomData', function onRoomData(data) {
      UI.initRoomData(data);
    });
    socket.on('roomIsSealed', function onRoomIsSealed() {
      UI.notifySealed();
    });
    socket.on('update', function onUpdate(data) {
      UI.updateRoomData(data);
    });

    // Оповещение о полученной роли
    socket.on('roleNotify', function onRoleNotify(role) {
      var roleName = ({
        "civilian": "мирный житель",
        "mafia": "мафиози",
        "detective": "комиссар"
      })[role];
      UI.logMessage("Игра началась. Вы — " + roleName + ".");
    });

    // События начала/конца игры
    socket.on('gameStarted', function onGameStarted() {
      UI.startGame();
    });
    socket.on('gameEnded', function onGameEnded(winner) {});

    // События о входе/выходе игрока из комнаты
    socket.on('playerJoined', function onPlayerJoined(playerName) {
      UI.addPlayer(playerName);
    });
    socket.on('playerLeft', function onPlayerLeft(playerIndex) {});

    // События, касающиеся ретранслируемой информации
    socket.on('chatMessage', function onChatMessage(data) {
      UI.addMessage(data.playerIndex, data.message);
    });
    socket.on('playerVote', function onPlayerVote(data) {
      UI.logMessage("Игрок #" + (data.playerIndex + 1) +
        " голосует против игрока #" + (data.vote + 1) + ".");
    });

    // Отправка подтверждения
    socket.emit('ackRoom', userData);
  }

  // Пространство имен UI.
  // Сюда относятся все функции и объекты, так или иначе манипулирующие
  // состоянием пользовательского интерфейса.
  UI = {
    // Список игроков
    playerList: [],

    // Инициализация UI
    init: function () {
      initSocket();
      UI.setActions();
    },

    // Установка обработчиков событий
    setActions: function () {
      $('#chat-form').submit(UI.sendMessage);
      $('#vote-form').submit(UI.vote);
    },

    // Добавление сообщения в чат
    addMessage: function (playerIndex, message) {
      var $message = $('<li>').text(" " + message);
      $message.prepend($('<b>').text(UI.playerList[playerIndex].playerName +
        ":"));
      $('#chat').prepend($message);
    },

    // Добавление информативного сообщения в чат
    logMessage: function (message) {
      var $message = $('<li>').append($('<i>').text(message));
      $('#chat').prepend($message);
    },

    // Установка статуса
    setStatus: function (state) {
      $('#status').text("Ход #" + state.move + " — " + (state.isDay ?
        "день" : "ночь") + (state.isVoting ? ", голосование" : ""));
    },

    // Установка состояния комнаты
    initRoomData: function (data) {
      ackData = data;

      if (data.gameState) {
        UI.setStatus(data.gameState);
      }
      if (data.canStartGame) {
        $('<a href="javascript:void(0)" id="start-game">').text(
          "Начать игру").insertAfter('#status');
        $('#start-game').click(function () {
          socket.emit('startGame');
        });
      }
      for (var i = 0; i < data.playerList.length; i++) {
        UI.addPlayer(data.playerList[i]);
        if (data.elimPlayers && i in data.elimPlayers) {
          UI.setPlayerRole(i, data.elimPlayers[i]);
        }
      }

      if (ackData.elimPlayers && ackData.playerIndex in ackData.elimPlayers) {
        $('#vote-form').remove();
      }
    },

    // Обновление состояния комнаты
    updateRoomData: function (data) {
      UI.setStatus(data.gameState);

      if (data.gameState.isVoting) {
        UI.logMessage("Начинается голосование!");
        if (data.gameState.isDay || ackData.playerRole == "mafia") {
          $('#vote-submit').prop('disabled', false);
        }
      } else {
        if (data.outvotedPlayer) {
          UI.logMessage("Игрок #" + (data.outvotedPlayer.playerIndex + 1) +
            " был " + (data.gameState.isDay ? "убит" :
              "посажен в тюрьму") + ".");
          UI.setPlayerRole(data.outvotedPlayer.playerIndex, data.outvotedPlayer
            .role);
        }
        if (data.gameState.isDay) {
          UI.logMessage("Наступает день, просыпаются мирные жители.");
          $('#chat-submit').prop('disabled', false);
        } else {
          UI.logMessage(
            "Наступает ночь, город засыпает. Просыпается мафия.");
          if (ackData.playerRole != "mafia") {
            $('#chat-submit').prop('disabled', true);
          }
        }
      }

      if (data.outvotedPlayer && ackData.playerIndex ===
        data.outvotedPlayer.playerIndex) {
        $('#vote-form').remove();
        UI.logMessage("Вы выбыли из игры.");
      }
    },

    // Оповещение о том, что комната запечатана
    notifySealed: function () {
      $('body').text("Игра уже началась.");
    },

    // Начало игры
    startGame: function () {
      $('#status').text("Ход #0 — день");
      $('#start-game').remove();
    },

    // Добавление игрока в список
    addPlayer: function (playerName) {
      var playerIndex = UI.playerList.length;
      UI.playerList.push({
        playerName: playerName
      });
      $('#players').append($('<li>').text(playerName));
      $('#vote-player').append($('<option>').val(playerIndex).text("#" +
        (
          playerIndex + 1) + " - " + playerName));
    },

    // Установка роли игрока
    setPlayerRole: function (playerIndex, role) {
      UI.playerList[playerIndex].role = role;
      var $player = $('#players').children().eq(playerIndex);
      $player.text($player.text() + " (" + role + ")");
    },

    // Отправка сообщения на сервер
    sendMessage: function () {
      socket.emit('chatMessage', {
        message: $('#message').val()
      });
      // Добавляем сообщение в окно чата и обнуляем поле ввода
      UI.addMessage(ackData.playerIndex, $('#message').val());
      $('#message').val('');
    },

    // Голосование
    vote: function () {
      var voteIndex = parseInt($('#vote-player').val());
      socket.emit('playerVote', {
        vote: voteIndex
      });
      // Блокируем кнопку голосования
      $('#vote-submit').prop('disabled', true);
      // Отображение в чате
      UI.logMessage("Вы проголосовали против игрока #" + (voteIndex + 1) +
        ".");
    }
  };

  UI.init();
})(jQuery);