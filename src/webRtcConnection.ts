/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const SimplePeer = require('simple-peer')
const wrtc = require('wrtc')
import { SignalData, Instance as SimplePeerInstance } from 'simple-peer'
import { Event } from './event'
import { Connection, ConnectionType } from './connection'

 type WebRtcInterface = {
  MediaStream: MediaStream
  MediaStreamTrack: MediaStreamTrack
  RTCDataChannel: RTCDataChannel
  RTCDataChannelEvent: RTCDataChannelEvent
  RTCDtlsTransport: RTCDtlsTransport
  RTCIceCandidate: RTCIceCandidate
  RTCIceTransport: RTCIceTransport
  RTCPeerConnection: RTCPeerConnection
  RTCPeerConnectionIceEvent: RTCPeerConnectionIceEvent
  RTCRtpReceiver: RTCRtpReceiver
  RTCRtpSender: RTCRtpSender
  RTCRtpTransceiver: RTCRtpTransceiver
  RTCSctpTransport: RTCSctpTransport
  RTCSessionDescription: RTCSessionDescription
  getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
  mediaDevices: MediaDevices
}

 export type IsomorphicWebRtc = WebRtcInterface | undefined
 
 /**
  * Light wrapper of WebRtc SimplePeer that knows how to send and receive
  * LooseMessages instead of strings/data.
  */
 export class WebRtcConnection extends Connection {
   private readonly peer: SimplePeerInstance
 
   /**
    * Event fired when the peer wants to signal its remote peer that an offer,
    * answer, or ice candidate is available
    */
   onSignal = new Event<[SignalData]>()
 
   constructor(
     initiator: boolean,
   ) {
     super(
       ConnectionType.WebRtc,
     ) 
     // TODO: This is using google STUN internally, we need to
     // make it use any of the websocket peers
     this.peer = new SimplePeer({ initiator, wrtc })
 
     this.peer.on('close', () => {
       this.setState({ type: 'DISCONNECTED' })
     })
 
     this.peer.on('error', (error: Error) => {
       this._error = error
       this.setState({ type: 'DISCONNECTED' })
     })
 
     this.peer.on('connect', () => {
       if (this.state.type !== 'WAITING_FOR_IDENTITY' && this.state.type !== 'CONNECTED') {
         this.setState({ type: 'WAITING_FOR_IDENTITY' })
       }
     })
 
     this.peer.on('signal', (signal: SignalData) => {
       if (this.state.type !== 'CONNECTED' && this.state.type !== 'WAITING_FOR_IDENTITY') {
         this.setState({ type: 'SIGNALING' })
       }
 
       this.onSignal.emit(signal)
     })
 
     this.peer.on('data', (data: string | Uint8Array) => {
       // simple-peer will sometimes emit data before emitting 'connect', so
       // make sure the connection state is updated
       if (this.state.type === 'SIGNALING') {
         this.setState({ type: 'WAITING_FOR_IDENTITY' })
         console.log(
           'Received data before WebRTC connect event fired, setting peer to WAITING_FOR_IDENTITY',
         )
       }
 
       let stringdata
       if (data instanceof Uint8Array) {
         stringdata = new TextDecoder().decode(data)
       } else stringdata = data
  
       let message
       try {
         message = stringdata
       } catch (error) {
         console.warn('Unable to parse webrtc message', stringdata)
         this.peer.destroy()
         return
       }
 
      console.log(`RECV ${this.displayName}: ${message.type}`)
 
       this.onMessage.emit(message)
     })
   }
 
   /**
    * Inject a signal from the peer during the connection negotiation phase
    */
   signal(data: SignalData): void {
     if (this.state.type === 'DISCONNECTED') return
     try {
       if (this.state.type === 'CONNECTING') {
         this.setState({ type: 'SIGNALING' })
       }
       this.peer.signal(data)
     } catch (error) {
       this.close(error)
     }
   }
 
   /**
    * Encode the message to json and send it to the peer
    */
   send = (message: string): boolean => {
 
    console.log(`SEND ${this.displayName}: ${message}`)
 
     const data = JSON.stringify(message)
     try {
       this.peer.send(data)
     } catch (e) {
       console.log(
         `Error occurred while sending ${message} in state ${this.state.type}`,
         e,
       )
       this.close(e)
       return false
     }
 
     return true
   }
 
   /**
    * Close the connection
    */
   close = (error?: unknown): void => {
     if (error) {
       if (!(error instanceof Error)) {
         console.warn(`Error in close() not an instance of Error: ${JSON.stringify(error)}`)
       }
 
       this._error = error
     }
 
     this.setState({ type: 'DISCONNECTED' })
     this.peer.destroy()
   }
 }
 