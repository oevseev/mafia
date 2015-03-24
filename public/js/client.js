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
    canStartGame: false,        // Может ли игрок начинать игру
    playerIndex: null,          // Индекс игрока (начиная с 0!)
    playerList: [],             // Список имен игроков в комнате
    disconnectedPlayers: [],    // Вышедшие из комнаты игроки
    role: null,                 // Роль игрока
    state: null,                // Состояние игры
    exposedPlayers: {}          // Список игроков, чья роль известна
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

      if (data.canStartGame) {
        // Если игрок может начать игру, добавляем большую зеленую кнопку
        UI.addStartButton();
      }

      if (data.isFirstConnection) {
        UI.logMessage("Добро пожаловать в игру!");
        if (data.canStartGame) {
          UI.shareLink();
        }
      } else {
        if (roomData.role) {
          UI.logMessage("Вы — %s.", getRoleName(roomData.role));
        } else {
          UI.logMessage("Игра еще не началась.");
        }
      }
    });

    // Сообщение о том, что комнаты не существует
    socket.on('roomDoesNotExist', function onRoomDoesNotExist() {
      // Так как шаблонизатор при подключении к несуществующей комнате выдает
      // ошибку 404, то это — исключительный случай и мы просто перенаправляем
      // игрока на главную.
      window.location.replace('/');
    });

    // Сообщение о том, что комната запечатана
    socket.on('roomIsSealed', function onRoomIsSealed() {
      UI.roomIsSealed();
    });

    // Начало игры
    socket.on('gameStarted', function onGameStarted(data) {
      roomData.role = data.role;
      UI.setPlayerInfo(roomData.playerIndex, {
        role: data.role
      });

      if (data.mafiaMembers) {
        for (var i = 0; i < data.mafiaMembers.length; i++) {
          roomData.exposedPlayers[data.mafiaMembers[i]] = {
            role: 'mafia',
            eliminated: false
          };
          UI.setPlayerInfo(data.mafiaMembers[i], {
            role: 'mafia'
          });
        }
      }

      UI.updateState({
        isDay: false,
        isVoting: false,
        turn: 0
      });

      UI.logMessage("Игра началась. Вы — %s.", getRoleName(data.role));
    });

    // Обновление состояния комнаты
    socket.on('update', function onUpdate(data) {
      roomData.state = data.state;
      UI.updateState(data.state);

      if (data.state.isVoting) {
        UI.logMessage("Начинается голосование!");
      } else {
        if (data.state.isDay) {
          UI.logMessage("Наступает день, просыпаются мирные жители.");
        } else {
          UI.logMessage(
            "Наступает ночь, мирные жители засыпают. Просыпается мафия.");
        }
      }

      if (data.outvotedPlayer) {
        var status = {
          role: data.outvotedPlayer.role,
          eliminated: true
        };

        roomData.exposedPlayers[data.outvotedPlayer.playerIndex] = status;
        UI.setPlayerInfo(data.outvotedPlayer.playerIndex, status)

        var outcome;
        if (data.state.isDay) {
          outcome = "убит";
        } else {
          outcome = "посажен в тюрьму";
        }

        UI.logMessage("Игрок ## *%s* (%s) был %s.",
          data.outvotedPlayer.playerIndex,
          roomData.playerList[data.outvotedPlayer.playerIndex],
          getRoleName(data.outvotedPlayer.role), outcome);
      }

      if (data.winner) {
        roomData.role = null;
        roomData.state = null;
        roomData.exposedPlayers = {};

        // Очищаем роли игроков
        for (var i = 0; i < roomData.playerList.length; i++) {
          UI.setPlayerInfo(i, {
            role: null,
            eliminated: false
          });
        }

        if (roomData.canStartGame) {
          UI.addStartButton();
        }

        if (data.winner == 'mafia') {
          UI.logMessage("Победила мафия!");
        } else {
          UI.logMessage("Победили мирные жители!");
        }

        UI.updateState(null);
      }
    });

    /**
     * События, связанные с игроками
     */

    // Присоединение игрока
    socket.on('playerJoined', function onPlayerJoined(data) {
      if (data.playerIndex >= roomData.playerList.length) {
        roomData.playerList.push(data.playerName);
      }

      UI.appendPlayer(data.playerIndex, data.playerName, true);
      UI.setPlayerInfo(data.playerIndex, {
        disconnected: false
      });

      UI.logMessage("Игрок ## *%s* присоединяется к игре.",
        data.playerIndex, data.playerName);
    });

    // Уход игрока
    socket.on('playerLeft', function onPlayerLeft(data) {
      var status = {};

      if (data.role) {
        // Раскрываем роль игрока и делаем его убитым
        status = {
          role: data.role,
          eliminated: true
        };
        roomData.exposedPlayers[data.playerIndex] = status;
      }

      // Вдобавок к информации, записываемой в exposedPlayers, мы сообщаем
      // о том, что игрок покинул комнату.
      status.disconnected = true;
      UI.setPlayerInfo(data.playerIndex, status);

      UI.logMessage("Игрок ## *%s* выходит из игры.",
        data.playerIndex, roomData.playerList[data.playerIndex]);
    });

    /**
     * События игры
     */

    // Получение сообщения
    socket.on('chatMessage', function onChatMessage(data) {
      UI.addMessage(data.playerIndex, roomData.playerList[data.playerIndex],
        data.message);
      UI.scrollChat(false);
    });

    // Оповещение о голосовании
    socket.on('playerVote', function onPlayerVote(data) {
      UI.logMessage("Игрок ## *%s* голосует против игрока ## *%s*!",
        data.playerIndex, roomData.playerList[data.playerIndex],
        data.vote, roomData.playerList[data.vote]);
    });

    // Ответ на выбор комиссара
    socket.on('detectiveResponse', function onChoiceResponse(data) {
      roomData.exposedPlayers[data.playerIndex] = {
        role: data.role,
        eliminated: false
      };
      UI.setPlayerInfo(data.playerIndex, {
        role: data.role
      });
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
      UI.setActions();

      // Прежде, чем инициализировать подключение, необходимо удостовериться
      // в том, что у игрока задано имя.
      UI.assertPlayerName(function () {
        initSocket();
      });
    },

    /**
     * Установка обработчиков событий
     */
    setActions: function () {
      // Действия панели навигации
      $('#nav-change-name').click(UI.changePlayerName);
      $('#nav-leave-game').click(UI.leaveGame);

      // Отправка сообщения
      $('#chat-form').submit(UI.sendMessage);
    },

    /**
     * Установка имени пользователя
     */
    setPlayerName: function (callback) {
      bootbox.prompt({
        title: "Введите имя:",
        buttons: {
          cancel: {
            label: "Отмена",
            className: 'btn-default',
          },
          confirm: {
            label: "Задать",
            className: 'btn-primary',
          }
        },
        callback: function (result) {
          if (result) {
            userData.playerName = result;
            Cookies.set('playerName', result);
          }
          if (callback) {
            callback(result);
          }
        }
      });
    },

    /**
     * Проверка на установленное имя игрока
     */
    assertPlayerName: function (callback) {
      if (userData.playerName) {
        callback();
      } else {
        // Если имя игрока задано, то просим его установить его
        UI.setPlayerName(callback);
      }
    },

    /**
     * Изменение имени игрока
     */
    changePlayerName: function () {
      UI.setPlayerName(function (playerName) {
        if (playerName) {
          bootbox.alert({
            title: "Готово!",
            message: "Изменения вступят в силу при подключении к следующей игре."
          });
        }
      });
    },

    /**
     * Выход из игры
     */
    leaveGame: function () {
      bootbox.dialog({
        title: "Выйти из игры?",
        message: "Ваша текущая роль будет раскрыта другим игрокам. " +
          "Вы больше не сможете подключиться к данной комнате.",
        buttons: {
          cancel: {
            label: "Отмена",
            className: 'btn-default'
          },
          confirm: {
            label: "Выйти",
            className: 'btn-danger',
            callback: function () {
              socket.emit('leaveGame');
              window.location.replace('/'); // Перенаправление на главную
            }
          }
        },
      });
    },

    /**
     * Сообщение о запечатанной комнате
     */
    roomIsSealed: function () {
      bootbox.alert({
        title: "Упс!",
        message: "К сожалению, данная комната запечатана, и к ней больше " +
          "нельзя присоединиться. Попробуйте найти другую комнату.",
        callback: function () {
          window.location.replace('/');
        }
      });
    },

    /**
     * Окно со ссылкой
     */
    shareLink: function () {
      var $textField = $('<input id="share-link" class="form-control">')
        .attr('type', 'text')
        .attr('value', window.location.href)
        .attr('readonly', true);

      var content = "Отправьте эту ссылку тем друзьям, которых вы хотите " +
        "пригласить в игру.\n" + $textField.prop('outerHTML');

      bootbox.dialog({
        title: "Пригласить друзей",
        message: content,
        buttons: {
          confirm: {
            label: "ОК",
            className: 'btn-primary'
          }
        }
      });

      $('#share-link').click(function () {
        $(this).select();
      });
    },

    /**
     * Добавляет кнопку начала игры к вершине списка игроков.
     */
    addStartButton: function () {
      var $startButton = $('<button class="btn btn-block btn-success">')
        .prop('id', 'start-button')
        .text("Начать игру");

      $startButton.click(function () {
        socket.emit('startGame');
        $(this).remove();
      });

      $('#client-left').prepend($startButton);
    },

    /**
     * Добавление игрока к списку игроков.
     *
     * Игрок добавляется в список в соответствии с индексом. Если игрок уже
     * присутствует в комнате, он не добавляется в список.
     */
    appendPlayer: function (playerIndex, playerName, animate) {
      // Так как внутреннее представление индексов игроков отсчитывается
      // от нуля, добавляем корректирующую единицу.
      var index = playerIndex + 1;

      // Не добавляем игрока, если он уже присутствует в комнате.
      if ($('#player-' + index).length) {
        return;
      }

      // Конструируем элемент списка
      var $playerEntry = $('<li class="player">')
        .attr('id', 'player-' + index)
        .append($('<div class="player-index">')
          .addClass('p' + index) // Данный класс задает цвет фона
          .text(index))
        .append($('<span class="player-name">')
          .text(playerName))
        .append($('<span class="player-aux">'))
        .append($('<div class="player-role-icon">'));

      $playerEntry.click(UI.vote);

      if (animate) {
        $('#player-list').append($playerEntry.hide().fadeIn());
      } else {
        $('#player-list').append($playerEntry);
      }
    },

    /**
     * Установка информации об игроке.
     *
     * Индекс задается от нуля. Вторым аргументом передается объект, поля
     * которого задают информацию, которую необходимо отобразить.
     */
    setPlayerInfo: function (playerIndex, data) {
      var $playerEntry = $('#player-' + (parseInt(playerIndex) + 1));

      // Флаги состояний
      var $playerName = $playerEntry.find('.player-name');
      if ('me' in data) {
        $playerName.toggleClass('me', data.me);
      }
      if ('disconnected' in data) {
        $playerName.toggleClass('disconnected', data.disconnected);
      }
      if ('eliminated' in data) {
        $playerName.toggleClass('eliminated', data.eliminated);
      }

      // Вспомогательный текст
      if ('disconnected' in data) {
        var isOwner = (playerIndex === 0);
        $playerEntry.find('.player-aux')
          .text(data.disconnected ? "вышел" : (isOwner ? "владелец" : ""));
      }

      // Иконка роли
      if ('role' in data) {
        var $roleIcon = $playerEntry.find('.player-role-icon');

        $roleIcon.removeClass().addClass('player-role-icon');
        if (data.role !== null) {
          $roleIcon.addClass(data.role);
        }
      }
    },

    /**
     * Инициализация UI информацией о комнате
     */
    initRoomData: function (data) {
      if (data.state) {
        UI.updateState(data.state);
      }

      for (var i = 0; i < data.playerList.length; i++) {
        UI.appendPlayer(i, data.playerList[i]);

        // Иницализируем структуру, которую будем заполнять для каждого игрока
        // той информацией, которая о нем известна.
        var playerInfo = {
          // Игрок — текущий игрок
          me: (i == roomData.playerIndex),
          // Игрок вышел из комнаты
          disconnected: (roomData.disconnectedPlayers.indexOf(i) != -1),
        };

        if (playerInfo.me && roomData.role) {
          playerInfo.role = roomData.role;
        }

        // Если известен статус игрока, указываем его
        if (i in roomData.exposedPlayers) {
          playerInfo.role = roomData.exposedPlayers[i].role;
          playerInfo.eliminated = roomData.exposedPlayers[i].eliminated;
        }

        UI.setPlayerInfo(i, playerInfo);
      }
    },

    /**
     * Обновление статуса игры
     */
    updateState: function (state) {
      $('#player-list').toggleClass('vote', Boolean(state &&
        state.isVoting && (state.isDay || roomData.role != 'civilian')));
      $('#chat-submit').prop('disabled', Boolean(state &&
        (!state.isDay && roomData.role != 'mafia')));

      var bgClass = 'bg-';
      if (state && !state.isDay) {
        bgClass += 'night';
      } else {
        bgClass += 'day';
      }

      $('#client-right').removeClass().addClass(bgClass);
    },

    /**
     * Прокрутка чата вниз
     */
    scrollChat: function (force) {
      var $chatList = $('#chat-list');

      // Проверяем, находится ли дельта прокрутки у нижней части чата
      var isAtBottom = $chatList.scrollTop() + $chatList.height() >
        $chatList[0].scrollHeight - 50; // С допустимым отклонением на 50px

      if (isAtBottom || force) {
        $chatList.stop(true); // Прерываем предыдущую анимацию
        $chatList.animate({
          scrollTop: $chatList[0].scrollHeight
        }, 500);
      }
    },

    /**
     * Добавление сообщения в чат
     */
    addMessage: function (playerIndex, playerName, message) {
      // Конструируем DOM-объект сообщения
      var $message = $('<li class="chat-message">')
        .append($('<div class="player-index">')
          .addClass('p' + (playerIndex + 1))
          .text(playerIndex + 1))
        .append($('<span class="player-name">')
          .text(playerName + ':'))
        .append($('<span class="message">')
          .text(message));

      // Добавляем его в чат
      $('#chat-list').append($message);
    },

    /**
     * Добавление информационного сообщения в чат
     */
    logMessage: function (message) {
      // Заполнение массива аргументов аргументами из объекта arguments
      var args = [];
      for (var i = 1; i < arguments.length; i++) {
        args.push(arguments[i]);
      }

      // Форматирование
      var msgText = message
        .replace(/##/g, '<span class="player-index">%d</span>')
        .replace(/\*(.*?)\*/, '<strong>$1</strong>');
      msgText = vsprintf(msgText, args);

      var $message = $('<li class="log-message">').html(msgText);

      // Окрашивание индексов игроков в соответствующие цвета и коррекция
      // их на единицу.
      $message.find('.player-index').each(function () {
        var playerIndex = parseInt($(this).text()) + 1;
        $(this).addClass('p' + playerIndex);
        $(this).text(playerIndex);
      });

      // Добавление информационного сообщения в чат
      $('#chat-list').append($message);
      UI.scrollChat(false);
    },

    /**
     * Отправка сообщения
     */
    sendMessage: function () {
      var $messageField = $(this).find('[name="message"]')[0];

      if (!$messageField.value) {
        return;
      }

      socket.emit('chatMessage', {
        message: $messageField.value
      });

      UI.addMessage(roomData.playerIndex,
        roomData.playerList[roomData.playerIndex], $messageField.value);
      $messageField.value = '';

      UI.scrollChat(true);
    },

    /**
     * Голосование
     */
    vote: function () {
      // Если родительский элемент кнопки не позволяет голосование, то
      // прерываем обработку события.
      if (!$(this).parent().hasClass('vote')) {
        return;
      }

      // Из ID кнопки с игроком получаем индекс игрока
      var selectedPlayer = parseInt($(this).attr('id').replace(/\D/g, '')) - 1;

      // Не даем проголосовать за себя
      if (selectedPlayer != roomData.playerIndex) {
        // Не даем проголосовать за убитого игрока
        if (!(selectedPlayer in roomData.exposedPlayers &&
          roomData.exposedPlayers[selectedPlayer].eliminated)) {

          $(this).parent().removeClass('vote');

          var actionName;
          if (!roomData.state.isDay && roomData.role != 'mafia') {
            socket.emit('playerChoice', {
              choice: selectedPlayer
            });
            actionName = "выбрали";
          } else {
            socket.emit('playerVote', {
              vote: selectedPlayer
            });
            actionName = "проголосовали против";
          }

          UI.logMessage("Вы %s игрока ## *%s*.", actionName,
            selectedPlayer, roomData.playerList[selectedPlayer]);
        }
      }
    }
  };

  // Инициализируем пользовательский интерфейс
  $(UI.init);
})(jQuery);