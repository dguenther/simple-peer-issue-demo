const { Stream } = require('stream')
const wrtc = require('wrtc')

export class Peer extends Stream.Duplex {
  _pc = null
  _channel = null

  _channelReady = false

  _isNegotiating = false

  destroyed = false
  destroying = false
  
  constructor(readonly initiator: boolean) {
    super({ allowHalfOpen: false })

    this._pc = new (wrtc.RTCPeerConnection)({
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:global.stun.twilio.com:3478'
          ]
        }
      ],
    })

    this._pc.oniceconnectionstatechange = () => {
      this._onIceStateChange()
    }
    this._pc.onicegatheringstatechange = () => {
      this._onIceStateChange()
    }
    this._pc.onsignalingstatechange = () => {
      if (this.destroyed) return

      if (this._pc.signalingState === 'stable') {
        this._isNegotiating = false
      }  
    }
    this._pc.onicecandidate = event => {
      if (this.destroyed) return
      if (event.candidate) {
        this.emit('signal', {
          type: 'candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid
          }
        })
      }
    }

    if (initiator) {
      this._setupData({
        channel: this._pc.createDataChannel('testChannel', {})
      })
    } else {
      this._pc.ondatachannel = event => {
        this._setupData(event)
      }
    }

    queueMicrotask(() => {
      if (this.initiator) {
        if (this.destroying) return
        if (this.destroyed) throw new Error('cannot negotiate after peer is destroyed')
    
        if (this.initiator && !this._isNegotiating) {
          this._createOfferAnswer('offer')
        }

        this._isNegotiating = true
      }
    })
  }

  _onIceStateChange () {
    if (this.destroyed) return
    const iceConnectionState = this._pc.iceConnectionState

    if (iceConnectionState === 'failed' || iceConnectionState === 'closed') {
      this.destroy(new Error(`Ice connection ${iceConnectionState}.`))
    }
  }

  _setupData (event) {
    this._channel = event.channel
    this._channel.binaryType = 'arraybuffer'

    this._channel.onopen = () => {
      if (this.destroyed) return
      this._channelReady = true
    }

    this._channel.onclose = () => {
      if (this.destroyed) return
      this.destroy()
    }

    this._channel.onerror = event => {
      const err = event.error instanceof Error
        ? event.error
        : new Error(`Datachannel error: ${event.message} ${event.filename}:${event.lineno}:${event.colno}`)
      this.destroy(err)
    }
  }

  _createOfferAnswer(offerAnswer: 'offer' | 'answer') {
    if (this.destroyed) return

    const promise = offerAnswer === 'offer' ? this._pc.createOffer({}) : this._pc.createAnswer({})

    promise
      .then(offer => {
        if (this.destroyed) return

        this._pc.setLocalDescription(offer)
          .then(() => {
            if (this.destroyed) return
            const signal = this._pc.localDescription || offer
            this.emit('signal', {
              type: signal.type,
              sdp: signal.sdp
            })
          })
          .catch(err => {
            this.destroy(err)
          })
      })
      .catch(err => {
        this.destroy(err)
      })
  }

  signal(data) {
    if (this.destroying) return
    if (this.destroyed) throw new Error('cannot signal after peer is destroyed')

    if (data.candidate) {
      if (this._pc.remoteDescription && this._pc.remoteDescription.type) {
        const iceCandidateObj = new wrtc.RTCIceCandidate(data.candidate)
        this._pc.addIceCandidate(iceCandidateObj)
          .catch(err => {
              this.destroy(err)
          })
      }
    }
    if (data.sdp) {
      this._pc.setRemoteDescription(new wrtc.RTCSessionDescription(data))
        .then(() => {
          if (this.destroyed) return
          if (this._pc.remoteDescription.type === 'offer') this._createOfferAnswer('answer')
        })
        .catch(err => {
          this.destroy(err)
        })
    }
  }

  destroy(err?: Error) {
    this._destroy(err, () => {})
  }

  _destroy(err: Error | undefined, cb: (error: Error) => void) {
    if (this.destroyed || this.destroying) return
    this.destroying = true

    queueMicrotask(() => { // allow events concurrent with the call to _destroy() to fire (see #692)
      this.destroyed = true
      this.destroying = false

      this._channelReady = false

      if (this._channel) {
        try {
          this._channel.close()
        } catch (err) {}

        // allow events concurrent with destruction to be handled
        this._channel.onopen = null
        this._channel.onclose = null
        this._channel.onerror = null
      }

      if (this._pc) {
        try {
          this._pc.close()
        } catch (err) {}

        // allow events concurrent with destruction to be handled
        this._pc.oniceconnectionstatechange = null
        this._pc.onicegatheringstatechange = null
        this._pc.onsignalingstatechange = null
        this._pc.onicecandidate = null
        this._pc.ondatachannel = null
      }

      this._pc = null
      this._channel = null

      if (err) cb(err)
    })
  }
}