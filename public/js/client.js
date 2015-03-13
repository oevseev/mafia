;
(function ($) {
  'use strict';

  // Сокет, с которым связывется клиент
  var socket;
  // Пользовательский интерфейс
  var UI;

  // Данные комнаты
  var roomData = {
    playerIndex: null, // Индекс игрока (начиная с 0!)
    playerList: [], // Список имен игроков в комнате
    role: null, // Роль игрока
    state: null, // Состояние игры
    exposedPlayers: {} // Список игроков, чья роль известна
  };

  // Настройка сокета.
  // Клиент подключается к сокету, устанавливает ответы на события игры и
  // отправляет подтверждающее сообщение серверу.
  function initSocket() {
    socket = io.connect();

    // События, касающиеся информации о комнате
    socket.on('roomData', function onRoomData(data) {
      for (var field in roomData) {
        if (field in data) {
          roomData[field] = data[field];
        }
      }
      UI.initRoomData(data);
    });
    socket.on('roomIsSealed', function onRoomIsSealed() {
      UI.roomIsSealed();
    });
    socket.on('update', function onUpdate(data) {
      roomData.state = data.state;
      if (data.outvotedPlayer) {
        roomData.exposedPlayers[data.outvotedPlayer.playerIndex] = {
          role: data.outvotedPlayer.role,
          eliminated: true
        };
      }
      UI.updateRoomData(data);
    });

    // События начала/конца игры
    socket.on('gameStarted', function onGameStarted(data) {
      roomData.role = data.role;
      if ('mafiaMembers' in data) {
        for (var index in data.mafiaMembers) {
          roomData.exposedPlayers[index] = {
            role: 'mafia',
            eliminated: false
          };
        }
      }
      UI.startGame(data);
    });
    socket.on('gameEnded', function onGameEnded(data) {
      UI.endGame(data.isMafiaWin);
    });

    // События о входе/выходе игрока из комнаты
    socket.on('playerJoined', function onPlayerJoined(data) {
      roomData.playerList.push(data.playerName);
      UI.addPlayer(roomData.playerList.length - 1, data.playerName);
      UI.logMessage("Игрок " + data.playerName + " присоединяется к игре.");
    });
    socket.on('playerLeft', function onPlayerLeft(data) {
      if (data.role) {
        roomData.exposedPlayers[data.playerIndex] = {
          role: data.role,
          eliminated: true
        }
        UI.setPlayerRole(data.playerIndex, data.role);
      }
      UI.logMessage("Игрок #" + (data.playerIndex + 1) + " выходит из игры.");
    });

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
      'civilian': "мирный житель",
      'mafia': "мафиози",
      'detective': "комиссар"
    })[role];
  }

  // Пространство имен UI.
  // Сюда относятся все функции и объекты, так или иначе манипулирующие
  // состоянием пользовательского интерфейса.
  UI = {
    // Инициализация UI
    init: function () {
      if (typeof userData.playerName == 'undefined') {
        var playerName = prompt('Введите свое имя:');
        if (playerName) {
          userData.playerName = playerName;
          Cookies.set('playerName', playerName);
        } else {
          $('body').text("Задайте имя, прежде чем играть.");
          return;
        }
      }

      initSocket();
      UI.setActions();
    },

    // Установка обработчиков событий
    setActions: function () {
      $('#chat-form').submit(UI.sendMessage);
      $('#vote-form').submit(UI.vote);

      $('#leave').click(function () {
        socket.emit('leaveGame');
        $('body').text("Вы вышли из игры.");
      });
    },

    // Добавление сообщения в чат
    addMessage: function (playerIndex, message) {
      var $message = $('<li>').text(" " + message);
      $message.prepend($('<b>').text(roomData.playerList[playerIndex] +
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
      if (state === null || state.move === 0) {
        $('#status').text("Ход #0 — знакомство мафии");

        if (roomData.role != 'mafia') {
          $('#chat-submit').prop('disabled', true);
        }
      } else {
        $('#status').text("Ход #" + state.move + " — " + (state.isDay ?
          "день" : "ночь") + (state.isVoting ? ", голосование" : ""));

        $('#vote-submit').prop('disabled', !state.isVoting || (!state.isDay &&
          roomData.role != 'mafia'));
        $('#chat-submit').prop('disabled', !state.isDay && roomData.role !=
          'mafia');
      }
    },

    // Установка состояния комнаты
    initRoomData: function (data) {
      if (data.state) {
        UI.setStatus(data.state);
      }

      if (data.canStartGame) {
        $('<a href="javascript:void(0)" id="start-game">').text(
          "Начать игру").insertAfter('#status');
        $('<br>').insertAfter('#start-game');
        $('#start-game').click(function () {
          socket.emit('startGame');
        });
      }

      for (var i = 0; i < data.playerList.length; i++) {
        UI.addPlayer(i, data.playerList[i]);
        if (data.exposedPlayers && i in data.exposedPlayers && data.exposedPlayers[
            i].eliminated) {
          UI.setPlayerRole(i, data.exposedPlayers[i].role);
        }
      }

      if (data.role) {
        UI.logMessage("Вы — " + getRoleName(data.role) + ".");
      }
      if (data.exposedPlayers && data.playerIndex in data.exposedPlayers &&
        data.exposedPlayers[data.playerIndex].eliminated) {
        $('#vote-form').remove();
      }
    },

    // Обновление состояния комнаты
    updateRoomData: function (data) {
      UI.setStatus(data.state);

      if (data.state.isVoting) {
        UI.logMessage("Начинается голосование!");
      } else {
        if (data.outvotedPlayer) {
          UI.logMessage("Игрок #" + (data.outvotedPlayer.playerIndex + 1) +
            " был " + (data.state.isDay ? "убит" : "посажен в тюрьму") +
            ".");
          UI.setPlayerRole(data.outvotedPlayer.playerIndex, data.outvotedPlayer
            .role);
        }
        if (data.state.isDay) {
          UI.logMessage("Наступает день, просыпаются мирные жители.");
        } else {
          UI.logMessage(
            "Наступает ночь, город засыпает. Просыпается мафия.");
        }
      }

      if (data.outvotedPlayer && roomData.playerIndex ===
        data.outvotedPlayer.playerIndex) {
        $('#vote-form').remove();
        UI.logMessage("Вы выбыли из игры.");
      }
    },

    // Оповещение о том, что комната запечатана
    roomIsSealed: function () {
      $('body').text("Игра уже началась.");
    },

    // Начало игры
    startGame: function (data) {
      UI.logMessage("Игра началась. Вы — " + getRoleName(data.role) + ".");

      UI.setStatus(null);
      $('#start-game').remove();

      if (data.mafiaMembers && data.role == 'mafia') {
        for (var i = 0; i < data.mafiaMembers.length; i++) {
          $('#players').children().eq(data.mafiaMembers[i]).css(
            'font-style', 'italic');
        }
      }
    },

    // Конец игры
    endGame: function (isMafia) {
      $('#vote-form').remove();

      if (isMafia) {
        UI.logMessage("Победила мафия!");
      } else {
        UI.logMessage("Победили мирные жители!");
      }

      setTimeout(function () {
        window.location.reload();
      }, 3000);
    },

    // Добавление игрока в список 
    addPlayer: function (playerIndex, playerName) {
      var $player = $('<li>').text(playerName);
      if (playerIndex == roomData.playerIndex) {
        $player.css('font-weight', 'bold');
      }
      if (roomData.exposedPlayers && playerIndex in roomData.exposedPlayers &&
        roomData.exposedPlayers[playerIndex].role == 'mafia') {
        $player.css('font-style', 'italic');
      }
      $('#players').append($player);
      $('#vote-player').append($('<option>').val(playerIndex).text("#" +
        (playerIndex + 1) + " - " + playerName));
    },

    // Установка роли игрока
    setPlayerRole: function (playerIndex, role) {
      var $player = $('#players').children().eq(playerIndex);
      $player.text($player.text() + " (" + getRoleName(role) + ")");
    },

    // Отправка сообщения на сервер
    sendMessage: function () {
      socket.emit('chatMessage', {
        message: $('#message').val()
      });
      // Добавляем сообщение в окно чата и обнуляем поле ввода
      UI.addMessage(roomData.playerIndex, $('#message').val());
      $('#message').val('');
    },

    // Голосование
    vote: function () {
      var voteIndex = parseInt($('#vote-player').val());
      if (!(voteIndex == roomData.playerIndex || voteIndex in roomData.exposedPlayers &&
          roomData.exposedPlayers[voteIndex].eliminated)) {
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