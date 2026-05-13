/**
 * Socket.IO handlers for chat: join session room, listen for chat:newMessage and dictionary:update.
 * Backend emits to room session:${sessionId} so only clients in that session get updates.
 */
function registerChatSocket(io) {
  io.on('connection', (socket) => {
    socket.on('chat:join', (data) => {
      const { sessionId } = data || {};
      if (sessionId) {
        const room = `session:${sessionId}`;
        socket.join(room);
        socket.data.chatSessionId = sessionId;
      }
    });

    socket.on('chat:leave', (data) => {
      const { sessionId } = data || {};
      if (sessionId) {
        socket.leave(`session:${sessionId}`);
      }
      if (socket.data) socket.data.chatSessionId = null;
    });

    socket.on('disconnect', () => {
      if (socket.data?.chatSessionId) {
        socket.leave(`session:${socket.data.chatSessionId}`);
      }
    });
  });
}

module.exports = { registerChatSocket };
