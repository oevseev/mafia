;
(function ($) {
  'use strict';

  /**
   * Комплексные объекты
   */
  var socket; // Сокет, с которым связывется клиент
  var UI; // Пользовательский интерфейс

  /**
   * Данные комнаты.
   *
   * Данная структура по умолчанию инициализируется нулевыми значениями.
   * Ее заполнение происходит по получении сообщения "roomData", при этом
   * заполняются те поля, которые имеют сходные наименования.
   */
  var roomData = {
    playerIndex: null, // Индекс игрока (начиная с 0!)
    playerList: [], // Список имен игроков в комнате
    role: null, // Роль игрока
    state: null, // Состояние игры
    exposedPlayers: {} // Список игроков, чья роль известна
  };

  /**
   * Настройка сокета.
   *
   * Клиент подключается к сокету, устанавливает ответы на события игры и
   * отправляет подтверждающее сообщение серверу.
   *
   * Стоит отметить, что изменение roomData происходит непосредственно
   * в обработчике событий, в то время как задача обновления UI возлагается
   * на функции соответствующего пространства имен.
   */
  function initSocket() {
    socket = io.connect();

    /**
     * События, касающиеся информации о комнате
     */

    // Получение информации о комнате
    socket.on('roomData', function onRoomData(data) {
      for (var field in roomData) {
        if (field in data) {
          roomData[field] = data[field];
        }
      }
      UI.initRoomData(data);
    });

    // Сообщение о том, что комнаты не существует
    socket.on('roomDoesNotExist', function onRoomDoesNotExist() {
      UI.roomDoesNotExist();
    });

    // Сообщение о том, что комната запечатана
    socket.on('roomIsSealed', function onRoomIsSealed() {
      UI.roomIsSealed();
    });

    // Обновление состояния комнаты
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

    /**
     * События начала/конца игры
     */

    // Начало игры
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

    // Конец игры
    socket.on('gameEnded', function onGameEnded(data) {
      UI.endGame(data.isMafiaWin);
    });

    /**
     * События, связанные с игроками
     */

    // Присоединение игрока
    socket.on('playerJoined', function onPlayerJoined(data) {
      // Добавляем игрока в список лишь в том случае, если он не подключался
      // комнате ранее. В противном случае только оповещаем чат.
      if (!data.wasInRoomBefore) {
        roomData.playerList.push(data.playerName);
        UI.addPlayer(roomData.playerList.length - 1, data.playerName);
      }
      UI.logMessage("Игрок " + data.playerName + " присоединяется к игре.");
    });

    // Уход игрока
    socket.on('playerLeft', function onPlayerLeft(data) {
      // Если игрок вышел до начала игры, его роль не вскрывается.
      if (data.role) {
        roomData.exposedPlayers[data.playerIndex] = {
          role: data.role,
          eliminated: true
        }
        UI.setPlayerRole(data.playerIndex, data.role);
      }
      // Во внутреннем представлении игры индексы отсчитываются с 0, поэтому
      // добавляем 1 для естественного отображения.
      UI.logMessage("Игрок #" + (data.playerIndex + 1) + " выходит из игры.");
    });

    /**
     * События игры
     */

    // Получение сообщения
    socket.on('chatMessage', function onChatMessage(data) {
      UI.addMessage(data.playerIndex, data.message);
    });

    // Оповещение о голосовании
    socket.on('playerVote', function onPlayerVote(data) {
      UI.logMessage("Игрок #" + (data.playerIndex + 1) +
        " голосует против игрока #" + (data.vote + 1) + ".");
    });

    /**
     * Отправка подтверждения на сервер
     */

    // Перед отправкой подтверждения в глобальной области видимости должна
    // находиться заполненная структура userData.
    //
    // После отправки подтверждения клиент может получить три возможных
    // сообщения: комната существует (roomData), комнаты не существует
    // (roomDoesNotExist) и комната запечатана (roomIsSealed).

    socket.emit('ackRoom', userData);
  }

  /**
   * Получение названия роли на русском языке
   */
  function getRoleName(role) {
    return ({
      'civilian': "мирный житель",
      'mafia': "мафиози",
      'detective': "комиссар"
    })[role];
  }

  /**
   * Пространство имен UI.
   *
   * Сюда относятся все функции и объекты, так или иначе манипулирующие
   * состоянием пользовательского интерфейса.
   */
  UI = {
    /**
     * Инициализация UI
     */
    init: function () {
      // Если имя игрока не задано, предлагаем ему сделать это
      if (typeof userData.playerName == 'undefined') {
        var playerName = prompt("Введите свое имя:");

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

    /**
     * Установка обработчиков событий
     */
    setActions: function () {
      $('#chat-form').submit(UI.sendMessage);
      $('#vote-form').submit(UI.vote);

      $('#leave').click(function () {
        socket.emit('leaveGame');
        $('body').text("Вы вышли из игры.");
      });
    },

    /**
     * Добавление сообщения в чат
     */
    addMessage: function (playerIndex, message) {
      var $message = $('<li>').text(" " + message);
      var $playerName = $('<b>').text(roomData.playerList[playerIndex] + ":");
      $message.prepend($playerName);
      $('#chat').prepend($message);
    },

    /**
     * Добавление информативного сообщения в чат
     */
    logMessage: function (message) {
      var $message = $('<li>').append($('<i>').text(message));
      $('#chat').prepend($message);
    },

    /**
     * Установка статуса
     */
    setStatus: function (state) {
      if (state === null || state.move === 0) {
        $('#status').text("Ход #0 — знакомство мафии");

        // В первую ночь чат доступен только мафии
        if (roomData.role != 'mafia') {
          $('#chat-submit').prop('disabled', true);
        }
      } else {
        $('#status').text("Ход #" + state.move + " — " + (state.isDay ?
          "день" : "ночь") + (state.isVoting ? ", голосование" : ""));

        // Кнопка голосования включается только в периоды голосования днем для
        // всех и ночью для мафии
        $('#vote-submit').prop('disabled', !state.isVoting || (!state.isDay &&
          roomData.role != 'mafia'));

        // Кнопка отправки сообщения доступна днем для всех и ночью для мафии
        $('#chat-submit').prop('disabled', !state.isDay && roomData.role !=
          'mafia');
      }
    },

    /**
     * Установка состояния комнаты
     */
    initRoomData: function (data) {
      if (data.state) {
        UI.setStatus(data.state);
      }

      // Если игрок может начинать игру, разрешаем ему это сделать
      if (data.canStartGame) {
        var $startGame = $('<a href="javascript:void(0)">').text(
          "Начать игру");

        $startGame.insertAfter('#status');
        $('<br>').insertAfter($startGame);

        $startGame.click(function () {
          socket.emit('startGame');
        });
      }

      // Заполняем список игроков
      for (var i = 0; i < data.playerList.length; i++) {
        UI.addPlayer(i, data.playerList[i]);
        if (data.exposedPlayers && i in data.exposedPlayers && data.
          exposedPlayers[i].eliminated) {
          UI.setPlayerRole(i, data.exposedPlayers[i].role);
        }
      }

      // Если игра уже началась, сообщаем игроку о его роли
      if (data.role) {
        UI.logMessage("Вы — " + getRoleName(data.role) + ".");
      }

      // Если игрок выбыл из игры, запрещаем ему голосовать
      if (data.exposedPlayers && data.playerIndex in data.exposedPlayers &&
        data.exposedPlayers[data.playerIndex].eliminated) {
        $('#vote-form').remove();
      }
    },

    /**
     * Обновление состояния комнаты
     */
    updateRoomData: function (data) {
      UI.setStatus(data.state);

      if (data.state.isVoting) {
        UI.logMessage("Начинается голосование!");
      } else {
        // Раскрытие роли игрока после голосования
        if (data.outvotedPlayer) {
          UI.logMessage("Игрок #" + (data.outvotedPlayer.playerIndex + 1) +
            " был " + (data.state.isDay ? "убит" : "посажен в тюрьму") + ".");
          UI.setPlayerRole(data.outvotedPlayer.playerIndex, data.
            outvotedPlayer.role);
        }

        if (data.state.isDay) {
          UI.logMessage("Наступает день, просыпаются мирные жители.");
        } else {
          UI.logMessage(
            "Наступает ночь, город засыпает. Просыпается мафия.");
        }
      }

      // Если выбывший игрок - клиент, то запрещаем ему голосовать
      if (data.outvotedPlayer && roomData.playerIndex === data.
        outvotedPlayer.playerIndex) {
        $('#vote-form').remove();
        UI.logMessage("Вы выбыли из игры.");
      }
    },

    /**
     * Оповещение о том, что комнаты не существует
     */
    roomDoesNotExist: function () {
      $('body').text("Комнаты не существует.");
    },

    /**
     * Оповещение о том, что комната запечатана
     */
    roomIsSealed: function () {
      $('body').text("Игра уже началась.");
    },

    /**
     * Начало игры
     */
    startGame: function (data) {
      UI.logMessage("Игра началась. Вы — " + getRoleName(data.role) + ".");

      UI.setStatus(null); // null соответствует первой ночи
      $('#start-game').remove();

      // Если игрок - мафия, то сообщаем ему о его сотоварищах
      if (data.mafiaMembers && data.role == 'mafia') {
        for (var i = 0; i < data.mafiaMembers.length; i++) {
          $('#players').children().eq(data.mafiaMembers[i]).css(
            'font-style', 'italic');
        }
      }
    },

    /**
     * Конец игры
     */
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

    /**
     * Добавление игрока в список 
     */
    addPlayer: function (playerIndex, playerName) {
      var $player = $('<li>').text(playerName);

      // Если добавляемый игрок - текущий
      if (playerIndex == roomData.playerIndex) {
        $player.css('font-weight', 'bold');
      }

      // Если добавляемый игрок - мафиози
      if (roomData.exposedPlayers && playerIndex in roomData.exposedPlayers &&
        roomData.exposedPlayers[playerIndex].role == 'mafia') {
        $player.css('font-style', 'italic');
      }

      $('#players').append($player);

      var voteEntryText = "#" + (playerIndex + 1) + " - " + playerName;
      var $voteEntry = $('<option>').val(playerIndex).text(voteEntryText);
      $('#vote-player').append($voteEntry);
    },

    /**
     * Установка роли игрока
     */
    setPlayerRole: function (playerIndex, role) {
      var $player = $('#players').children().eq(playerIndex);
      $player.text($player.text() + " (" + getRoleName(role) + ")");
    },

    /**
     * Отправка сообщения на сервер
     */
    sendMessage: function () {
      socket.emit('chatMessage', {
        message: $('#message').val()
      });

      // Добавляем сообщение в окно чата и обнуляем поле ввода
      UI.addMessage(roomData.playerIndex, $('#message').val());
      $('#message').val('');
    },

    /**
     * Голосование
     */
    vote: function () {
      var voteIndex = parseInt($('#vote-player').val());

      // Запрещаем голосовать за себя и за выбывших
      if (!(voteIndex == roomData.playerIndex || voteIndex in roomData.
        exposedPlayers && roomData.exposedPlayers[voteIndex].eliminated)) {
        socket.emit('playerVote', {
          vote: voteIndex
        });

        // Блокируем кнопку голосования
        $('#vote-submit').prop('disabled', true);
        UI.logMessage("Вы проголосовали против игрока #" + (voteIndex + 1) +
          ".");
      }
    }
  };

  // Инициализируем пользовательский интерфейс
  $(UI.init);
})(jQuery);