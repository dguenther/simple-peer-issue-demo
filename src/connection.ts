/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import { Event } from './event'
  
 /**
  * The type of peer connection. This should only be used for information
  * reporting purposes. Switching on the type indicates an api design flaw,
  * as peers should generally behave identically once connected.
  */
 export enum ConnectionType {
   WebSocket = 'WebSocket',
   WebRtc = 'WebRtc',
 }
 
 type ConnectionState =
   | { type: 'DISCONNECTED' }
   | { type: 'CONNECTING' }
   /* A WebRTC-exclusive state that requires an identity */
   | { type: 'REQUEST_SIGNALING' }
   /* A WebRTC-exclusive state that requires an identity */
   | { type: 'SIGNALING' }
   | { type: 'WAITING_FOR_IDENTITY' }
   | { type: 'CONNECTED'; identity: string }
 
 /**
  * Model any connection that can send and receive messages.
  */
 export abstract class Connection {
   readonly type: ConnectionType
   private handshakeTimeout: ReturnType<typeof setTimeout> | null = null
  
   /**
    * The last error received (if any), regardless of the current state of the connection.
    */
   protected _error: unknown | null
   get error(): Readonly<unknown> | null {
     return this._error as Readonly<unknown>
   }
 
   /**
    * Indicates the current state of the connection.
    */
   private _state: Readonly<ConnectionState> = { type: 'CONNECTING' }
   get state(): Readonly<ConnectionState> {
     return this._state
   }
 
   /**
    * The loggable name of the connection.
    */
   get displayName(): string {
     const name =
       this.state.type === 'CONNECTED' ? this.state.identity.slice(0, 7) : 'unidentified'
     return `${this.type} ${name}`
   }
 
   /**
    * Event fired when the state of the connection changes.
    */
   readonly onStateChanged: Event<[]> = new Event()
 
   /**
    * Event fired when a new message comes in. The data is converted to a
    * json obj and verifies that it has a type attribute before being passed
    * in.
    */
   readonly onMessage: Event<[string]> = new Event()
 
   /**
    * Send a message into this connection.
    */
   abstract send: (object: string) => boolean
 
   /**
    * Shutdown the connection, if possible
    */
   abstract readonly close: (error?: unknown) => void
 
   constructor(
     type: ConnectionType,
   ) {
     this.type = type
     this._error = null
   }
 
   setState(state: Readonly<ConnectionState>): void {
     const prevState = this._state
     this._state = state
 
     if (prevState.type !== state.type) {
       if (this.handshakeTimeout) {
         // Clear handshakeTimeout because were changing state
         // and we have a timeout per handshake phase or were
         // done doing the handshake
         clearTimeout(this.handshakeTimeout)
         this.handshakeTimeout = null
       }
 
       if (
         state.type === 'REQUEST_SIGNALING' ||
         state.type === 'SIGNALING' ||
         state.type === 'WAITING_FOR_IDENTITY'
       ) {
         const timeout = 30000
 
         this.handshakeTimeout = setTimeout(() => {
           const error = `Closing ${this.type} connection because handshake timed out in state ${state.type} after ${timeout}ms`
           console.log(error)
           this.close(new Error(error))
         }, timeout)
       }
 
       if (state.type === 'CONNECTED') {
         this._error = null
       }
 
    //    console.log(
    //      `CONN ${this.displayName} STATE ${prevState.type} -> ${state.type}`,
    //    )
     }
 
     this.onStateChanged.emit()
   }
 }
 