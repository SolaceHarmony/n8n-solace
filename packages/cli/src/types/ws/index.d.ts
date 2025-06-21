import * as WebSocketModule from 'ws';

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
  }
  
  namespace WebSocket {
    interface WebSocket {
      isAlive: boolean;
    }
  }
}
