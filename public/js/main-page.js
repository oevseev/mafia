;
(function ($) {
  var socket;

  /**
   * Показ оверлея с сообщением о загрузке
   */
  var displayLoading = function (message) {
  };

  /**
   * Подключение к сокету и отправка сообщения
   */
  var emit = function (eventName) {
    socket = io.connect();
    socket.once('roomIDReturned', function onRoomFound(roomID) {
      window.location.replace('/id/' + roomID);
    });
    socket.emit(eventName);
  };

  /**
   * Установка обработчиков нажатий кнопок
   */
  var setButtonActions = function () {
    $('#find-game').click(function () {
      displayLoading("Идет поиск игры.");
      emit('findRoom');
    });
    $('#new-game').click(function () {
      displayLoading("Идет создание комнаты.")
      emit('newRoom');
    });
  };

  /**
   * Инициализация
   */
  var init = function () {
    setButtonActions();
  };

  $(init);
})(jQuery);