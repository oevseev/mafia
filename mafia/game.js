// Прототип класса игры
function Game(room, callback) {
  // Комната, которой принадлежит игра
  this.room = room;

  // Коллбэк игры
  this.callback = callback;

  // Состояние игры
  this.state = {
    isDay: false, // Является ли текущая фаза днем
    isVoting: false, // Идет ли голосование
    move: 0 // Текущий ход
  };

  // Таймаут и следующая смена фазы
  this.timeout = null;
  this.nextPhaseChange = null;

  // Роли игроков
  this.roles = {};
  // Выбывшие игроки
  this.elimPlayers = [];
  // Результаты голосования
  this.votes = {};

  // Назначение ролей
  this.assignRoles = function () {
    var civilians = [];

    // Изначально все — честные граждане
    for (var id in this.room.clients) {
      this.roles[id] = "civilian";
      civilians.push(id);
    }

    // Назначаем членов мафии согласно mafiaCoeff (каждый N-ный — мафиози)
    var maxMafia = Math.floor(this.room.ids.length /
      this.room.options.mafiaCoeff);

    for (var i = 0; i < maxMafia; i++) {
      var id = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[id] = "mafia";
      // Подключение к особой комнате Socket.IO
      this.room.clients[id].socket.join(this.room.id + '_m');
      civilians.splice(civilians.indexOf(id), 1);
    }

    // Назначение комиссара
    /*
    if (civilians) {
      var id = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[id] = "detective";
    }
    */
  };

  // Получение списка выбывших игроков (в формате индекс-роль)
  this.getElimPlayers = function () {
    var elimList = {};
    for (var i = 0; i < this.elimPlayers.length; i++) {
      elimList[this.room.ids.indexOf(this.elimPlayers[i])] = this.roles[
        this.elimPlayers[i]];
    }
    return elimList;
  };

  // Получение индексов игроков-мафиози
  this.getMafia = function () {
    var mafiaList = [];
    for (var id in this.roles) {
      if (this.roles[id] == "mafia") {
        mafiaList.push(this.room.ids.indexOf(id));
      }
    }
    return mafiaList;
  };

  // Получение победителя
  this.getWinner = function () {
    // Подсчет числа активных игроков по ролям
    var civilian_count = 0, mafia_count = 0;
    for (var id in this.roles) {
      if (!(id in this.elimPlayers)) {
        if (this.roles[id] == "mafia") {
          mafia_count++;
        } else {
          civilian_count++;
        }
      }
    }

    if (mafia_count == 0) {
      // Мирные горожане побеждают, если пойманы все мафиози.
      return "civilian";
    } else if (civilian_count <= mafia_count) {
      // Мафия побеждает, если число ее членов сравнялось с числом живых
      // мирных горожан.
      return "mafia";
    } else {
      return null;
    }
  };

  // Смена фазы
  this.nextPhase = function () {
    if (this.state.isVoting) {
      // Если фаза голосования прошла, то вычисляем результат голосования
      var outvotedPlayer = this.processVoteResult();
      if (outvotedPlayer) {
        this.elimPlayers.push(this.room.ids[outvotedPlayer.playerIndex]);
      }
      // Отключаем голосование
      this.state.isVoting = false;
      // Меняем день на ночь и наоборот
      this.state.isDay = !this.state.isDay;
    } else {
      // В противном случае возможны два варианта
      if (this.state.move === 0 || (this.state.move === 1 && this.state.isDay)) {
        // Ознакомительная фаза или первый день — голосования нет
        this.state.isDay = !this.state.isDay;
      } else {
        // В любом другом случае включаем голосование
        this.state.isVoting = true;
      }
    }

    // В случае, если начался новый день, увеличиваем счетчик шагов
    if (this.state.isDay && !this.state.isVoting) {
      this.state.move++;
    }

    // Выбираем подходящий таймаут (и строку в лог)
    var timeout, phaseName;
    if (this.state.isVoting) {
      timeout = this.room.options.voteTimeout;
      phaseName = (this.state.isDay ? "дневное" : "ночное") +
        " голосование";
    } else {
      timeout = this.state.isDay ? this.room.options.dayTimeout : this.room
        .options.nightTimeout;
      phaseName = this.state.isDay ? "день" : "ночь";
    }

    // Оповещаем игроков об обновлении состояния игры
    this.callback('update', {
      gameState: this.state,
      outvotedPlayer: outvotedPlayer
    });

    // Проверка на победу
    var winner = this.getWinner();
    if (winner === null) {
      // Переход к следующему ходу
      this.timeout = setTimeout(this.nextPhase.bind(this), timeout * 1000);
      console.log("[GAME] [" + this.room.id + "] Ход #" + this.state.move +
        ", наступает " + phaseName + ".");
    } else {
      this.callback('gameEnded', winner == "mafia");
      console.log("[GAME] [" + this.room.id + "] Победа " + (winner ==
        "mafia" ? "мафии" : "мирных горожан") + ".");
      this.room.game = null; // Удаление игры
    }
  };

  // Обработка голосования
  this.processVote = function (playerID, vote) {
    if (!(playerID in this.votes) && !(playerID in this.elimPlayers)) {
      if (typeof this.room.ids[vote] != 'undefined') {
        this.votes[playerID] = this.room.ids[vote];
        console.log("[GAME] [" + this.room.id + "] Игрок " + this.room.clients[
            playerID].playerName + " голосует против игрока " + this.room
          .clients[
            this.votes[playerID]].playerName + ".");
      }
    }
  };

  // Обработка результата голосования
  this.processVoteResult = function () {
    // Голосование не учитывается, если не было проголосовавших
    if (Object.keys(this.votes).length == 0) {
      return null;
    }

    // Подсчет числа голосов за каждого игрока
    var voteCount = {};
    for (var id in this.votes) {
      if (this.votes[id] in voteCount) {
        voteCount[this.votes[id]] ++;
      } else {
        voteCount[this.votes[id]] = 1;
      }
    }

    // Поиск максимального числа голосов и составление списка кандидатов
    var max_votes = Math.max.apply(null, Object.keys(voteCount).map(
      function (x) {
        return voteCount[x];
      }));
    var candidates = [];
    for (var id in voteCount) {
      if (voteCount[id] == max_votes) {
        candidates.push(id);
      }
    }

    // Обнуление результатов голосования
    this.votes = {};

    // Выбор случайного кандидата на вылет
    var candidate = candidates[Math.floor(Math.random() * candidates.length)];
    console.log("[GAME] [" + this.room.id + "] Игрок " + this.room.clients[
        candidate].playerName + " (" + this.roles[candidate] +
      ") выбывает из игры.");

    // Объявление кандидата
    return {
      playerIndex: this.room.ids.indexOf(candidate),
      role: this.roles[candidate]
    };
  };

  // Начало игры
  this.start = function () {
    // Назначаем роли и сообщаем их игрокам
    this.assignRoles();
    for (var id in this.room.clients) {
      this.room.clients[id].socket.emit('gameStarted', {
        role: this.roles[id],
        mafiaMembers: this.roles[id] == "mafia" ? this.getMafia() : undefined
      });
    }

    // Запускаем цепную реакцию!
    this.timeout = setTimeout(this.nextPhase.bind(this),
      this.room.options.dayTimeout * 1000);

    console.log("[GAME] [" + this.room.id + "] Игра началась.");
  };
}

// Создание игры.
exports.newGame = function (room, callback) {
  if (!room.game) {
    room.game = new Game(room, callback);
    room.game.start();
  }
};