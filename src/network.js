// network.js — WebSocket relay client wrapper

export class Network {
  constructor(relayUrl) {
    this.relayUrl = relayUrl;
    this.ws       = null;
    this.role     = null;  // 'host' | 'guest'
    this.roomCode = null;
    this.onMessage   = null;
    this.onConnected = null;
    this.onOpponentJoined = null;
    this.onOpponentLeft   = null;
    this.onError     = null;
  }

  connect(role, roomCode) {
    this.role     = role;
    this.roomCode = roomCode.toUpperCase();
    this.ws = new WebSocket(this.relayUrl);

    this.ws.addEventListener('open', () => {
      this.ws.send(JSON.stringify({ type: 'role', role: this.role, room: this.roomCode }));
    });

    this.ws.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === 'joined') {
        if (this.onConnected) this.onConnected(msg);
        return;
      }
      if (msg.type === 'guest_joined') {
        if (this.onOpponentJoined) this.onOpponentJoined();
        return;
      }
      if (msg.type === 'opponent_left') {
        if (this.onOpponentLeft) this.onOpponentLeft();
        return;
      }
      if (msg.type === 'error') {
        if (this.onError) this.onError(msg.msg);
        return;
      }
      if (this.onMessage) this.onMessage(msg);
    });

    this.ws.addEventListener('close', () => {
      if (this.onOpponentLeft) this.onOpponentLeft();
    });

    this.ws.addEventListener('error', () => {
      if (this.onError) this.onError('WebSocket error');
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  disconnect() {
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
