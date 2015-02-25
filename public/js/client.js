;
(function ($) {
  'use strict';

  // Сокет, с которым связывется клиент
  var socket;
  // Пользовательский интерфейс
  var UI;
  // Данные пользователя
  var gameData;

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
      gameData.playerRole = role;
      UI.logMessage("Игра началась. Вы — " + getRoleName(role) + ".");
    });

    // События начала/конца игры
    socket.on('gameStarted', function onGameStarted() {
      UI.startGame();
    });
    socket.on('gameEnded', function onGameEnded(isMafia) {
      UI.endGame(isMafia);
    });

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

  // Получение названия роли на русском языке
  function getRoleName(role) {
    return ({
      "civilian": "мирный житель",
      "mafia": "мафиози",
      "detective": "комиссар"
    })[role];
  }

  // Пространство имен UI.
  // Сюда относятся все функции и объекты, так или иначе манипулирующие
  // состоянием пользовательского интерфейса.
  UI = {
    // Список игроков
    playerList: [],

    // Инициализация UI
    init: function () {
      if (typeof userData.playerName == 'undefined') {
        $('body').text('Задайте имя, прежде чем играть.');
        return;
      }

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
      gameData = {
        playerIndex: data.playerIndex,
        playerRole: data.playerRole
      };

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

      if (data.elimPlayers && data.playerIndex in data.elimPlayers) {
        $('#vote-form').remove();
      }

      if (data.playerRole) {
        UI.logMessage("Вы — " + getRoleName(data.playerRole) + ".");
      }
    },

    // Обновление состояния комнаты
    updateRoomData: function (data) {
      UI.setStatus(data.gameState);

      if (data.gameState.isVoting) {
        UI.logMessage("Начинается голосование!");
        if (data.gameState.isDay || gameData.playerRole == "mafia") {
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
          if (gameData.playerRole != "mafia") {
            $('#chat-submit').prop('disabled', true);
          }
        }
      }

      if (data.outvotedPlayer && gameData.playerIndex ===
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
      $('#status').text("Ход #0 — знакомство мафии");
      $('#start-game').remove();
    },

    // Конец игры
    endGame: function (isMafia) {
      $('#vote-form').remove();
      if (isMafia) {
        UI.logMessage("Победила мафия!");
      } else {
        UI.logMessage("Победили мирные жители!");
      }
    },

    // Добавление игрока в список 
    addPlayer: function (playerName) {
      var playerIndex = UI.playerList.length;
      UI.playerList.push({
        playerName: playerName
      });
      var $player = $('<li>').text(playerName);
      if (playerIndex == gameData.playerIndex) {
        $player.css('font-weight', 'bold');
      }
      $('#players').append($player);
      $('#vote-player').append($('<option>').val(playerIndex).text("#" +
        (playerIndex + 1) + " - " + playerName));
    },

    // Установка роли игрока
    setPlayerRole: function (playerIndex, role) {
      UI.playerList[playerIndex].role = getRoleName(role);
      var $player = $('#players').children().eq(playerIndex);
      $player.text($player.text() + " (" + getRoleName(role) + ")");
    },

    // Отправка сообщения на сервер
    sendMessage: function () {
      socket.emit('chatMessage', {
        message: $('#message').val()
      });
      // Добавляем сообщение в окно чата и обнуляем поле ввода
      UI.addMessage(gameData.playerIndex, $('#message').val());
      $('#message').val('');
    },

    // Голосование
    vote: function () {
      var voteIndex = parseInt($('#vote-player').val());
      if (!(voteIndex == gameData.playerIndex || UI.playerList.role[
          voteIndex])) {
        socket.emit('playerVote', {
          vote: voteIndex
        });
        // Блокируем кнопку голосования
        $('#vote-submit').prop('disabled', true);
        // Отображение в чате
        UI.logMessage("Вы проголосовали против игрока #" + (voteIndex + 1) +
          ".");
      }
    }
  };

  UI.init();
})(jQuery);