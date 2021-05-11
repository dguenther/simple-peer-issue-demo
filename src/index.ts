import { WebRtcConnection } from './webRtcConnection'
require('segfault-handler').registerHandler('segfault.log')

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * The value is no lower than min (or the next integer greater than min
 * if min isn't an integer) and no greater than max (or the next integer
 * lower than max if max isn't an integer).
 * Using Math.round() will give you a non-uniform distribution!
 */
 function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

let iteration = 0

const initiators = []
const recipients = []

async function eventLoop() {
    console.log(`Iteration ${++iteration}: ${initiators.length} ${recipients.length}`)

    while (initiators.length > 20) {
        const conn = initiators.splice(getRandomInt(0, initiators.length - 1), 1)[0]
        conn.close()
    }

    while (recipients.length > 20) {
        const conn = recipients.splice(getRandomInt(0, initiators.length - 1), 1)[0]
        conn.close()
    }

    for (let i = 0; i < 4; i++) {
        const recip = new WebRtcConnection(false)
        const init = new WebRtcConnection(true)
        init.onSignal.on((c) => {
            recip.signal(c)
        })
        recip.onSignal.on((c) => {
            init.signal(c)
        })

        initiators.push(init)
        recipients.push(recip)
    }

    setTimeout(eventLoop, 100)
}

eventLoop()