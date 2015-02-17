socket = io.connect();

socket.on('roomIsSealed', function () {
  $('body').append($('<p>').text("Игра уже началась."));
});
socket.on('initRoomInfo', function (data) {
  for (var i = 0; i < data.playerList.length; i++) {
    $('#players').append($('<li>').text(data.playerList[i]));
  }
  if (data.canStartGame) {
    $('<a href="javascript:void(0)" class="start-game">').text("Начать игру").insertAfter('h2');
    $('.start-game').click(function () { socket.emit('startGame', userData); });
  }
  if (data.gameInfo) {
    $('h2').text($('h2').text() + " — игра началась");
  }
});
socket.on('newPlayer', function (playerName) {
  $('#players').append($('<li>').text(playerName));
});
socket.on('gameStarted', function () {
  $('h2').text($('h2').text() + " — игра началась");
  $('.start-game').remove();
});
socket.on('chatMessage', function (data) {
  $('#chat').prepend($('<li>').html("<b>" + data.playerName + ":</b> " + data.message));
});

$('form').submit(function () {
  socket.emit('chatMessage', {roomID: userData.roomID, playerName: userData.playerName, message: $('#msg').val()});
  $('#chat').prepend($('<li>').html("<b>" + userData.playerName + ":</b> " + $('#msg').val()));
  $('#msg').val('');
});

socket.emit('ackRoom', userData);