// WebRTC signaling через WebSocket

class WebRTCSignaling {
  constructor(wsHandler) {
    this.wsHandler = wsHandler;
  }

  handleSignal(userId, data) {
    const { type, callId, roomId, signal, targetUserId } = data;

    console.log('📞 WebRTC Signal:', { type, callId, userId, targetUserId });

    switch (type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Переслать сигнал конкретному пользователю или всем в комнате
        if (targetUserId) {
          this.sendToUser(targetUserId, {
            type: `webrtc:${type}`,
            data: {
              callId,
              fromUserId: userId,
              signal,
            },
          });
        } else {
          this.broadcastToRoom(roomId, userId, {
            type: `webrtc:${type}`,
            data: {
              callId,
              fromUserId: userId,
              signal,
            },
          });
        }
        break;
    }
  }

  sendToUser(userId, message) {
    const client = Array.from(this.wsHandler.clients.values())
      .find(c => c.userId === userId);
    
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  }

  broadcastToRoom(roomId, excludeUserId, message) {
    this.wsHandler.clients.forEach(client => {
      if (client.userId !== excludeUserId && 
          client.subscriptions.has(`room:${roomId}`) &&
          client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }
}

module.exports = WebRTCSignaling;
