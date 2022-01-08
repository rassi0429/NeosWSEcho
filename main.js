const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

const roomMap = new Map()


wss.on('connection', (ws, request) => {

    const room = request.url

    if (!roomMap.has(room)) {
        roomMap.set(room, [ws])
    } else {
        roomMap.set(room, [ws, ...roomMap.get(room)])
    }

    ws.on('message', (message) => {
        const room = roomMap.get(request.url)
        if (!room) return
        room.forEach((client) => {
            client.send(message.toString())
        })
    });
});

server.on('upgrade', function (request, socket, head) {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(3000);