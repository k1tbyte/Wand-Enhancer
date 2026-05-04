const crypto = require('node:crypto');

const { BRIDGE_PROTOCOL_VERSION, WS_OPCODE } = require('./constants.cjs');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function jsonMessage(type, payload, requestId = null) {
    return JSON.stringify({
        type,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId,
        payload,
    });
}

function makeFrame(opcode, payload) {
    const source = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const header = [];
    header.push(0x80 | (opcode & 0x0f));

    if (source.length < 126) {
        header.push(source.length);
        return Buffer.concat([Buffer.from(header), source]);
    }

    if (source.length < 65536) {
        const prefix = Buffer.from([header[0], 126, (source.length >> 8) & 0xff, source.length & 0xff]);
        return Buffer.concat([prefix, source]);
    }

    const prefix = Buffer.alloc(10);
    prefix[0] = header[0];
    prefix[1] = 127;
    prefix.writeUInt32BE(0, 2);
    prefix.writeUInt32BE(source.length, 6);
    return Buffer.concat([prefix, source]);
}

function sendText(client, text) {
    if (!client.closed) {
        client.socket.write(makeFrame(WS_OPCODE.TEXT, Buffer.from(text, 'utf8')));
    }
}

function sendJson(client, type, payload, requestId = null) {
    sendText(client, jsonMessage(type, payload, requestId));
}

function closeClient(client, code = 1000, reason = 'Closing') {
    if (client.closed) {
        return;
    }

    client.closed = true;
    const reasonBuffer = Buffer.from(reason, 'utf8');
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    client.socket.write(makeFrame(WS_OPCODE.CLOSE, payload));
    client.socket.end();
}

function parseFrame(buffer) {
    if (buffer.length < 2) {
        return null;
    }

    const first = buffer[0];
    const second = buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
        if (buffer.length < offset + 2) {
            return null;
        }

        length = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (length === 127) {
        if (buffer.length < offset + 8) {
            return null;
        }

        const high = buffer.readUInt32BE(offset);
        const low = buffer.readUInt32BE(offset + 4);
        if (high !== 0) {
            throw new Error('Large websocket frames are not supported.');
        }

        length = low;
        offset += 8;
    }

    let mask = null;
    if (masked) {
        if (buffer.length < offset + 4) {
            return null;
        }

        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
    }

    if (buffer.length < offset + length) {
        return null;
    }

    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    if (masked && mask) {
        for (let index = 0; index < payload.length; index += 1) {
            payload[index] ^= mask[index % 4];
        }
    }

    return {
        bytesConsumed: offset + length,
        fin,
        opcode,
        payload,
    };
}

function createAcceptKey(key) {
    return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

module.exports = {
    closeClient,
    createAcceptKey,
    jsonMessage,
    makeFrame,
    parseFrame,
    sendJson,
    sendText,
};
